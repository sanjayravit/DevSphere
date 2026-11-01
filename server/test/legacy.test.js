import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import firebaseAdmin from '../firebaseAdmin.js';
import { signSession } from '../config/session.js';
import { fakeFirestore } from './helpers/firestore.js';
import { mockProviders } from './helpers/providers.js';
import workspaces from '../routes/workspaces.js';
import projects from '../routes/projects.js';
import posts from '../routes/post.js';
import marketplace from '../routes/marketplace.js';
import ai from '../routes/ai.js';
const geminiResponse = text => ({ candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP' }] });
const analysis = { score: 78, summary: 'A fixture response from the explicitly mocked provider.', strengths: ['Relevant experience'], improvements: ['Clarify outcomes'] };
async function platform(t, configuration = {}) {
  const provider = mockProviders(t, configuration);
  const oldKey = process.env.GEMINI_API_KEY; process.env.GEMINI_API_KEY = 'mock-gemini-credential';
  const original = firebaseAdmin.db; const database = fakeFirestore(); firebaseAdmin.db = database;
  const app = express(); app.use(express.json({ limit: '1mb' }));
  app.use('/workspaces', workspaces); app.use('/projects', projects); app.use('/posts', posts); app.use('/market', marketplace); app.use('/ai', ai);
  const server = http.createServer(app); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); firebaseAdmin.db = original; if (oldKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = oldKey; });
  const request = async (path, { method = 'GET', body, user = 'user-a', form } = {}) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { method, headers: { ...(user ? { Authorization: `Bearer ${signSession(user)}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: form || (body ? JSON.stringify(body) : undefined) });
    return { status: response.status, body: await response.json() };
  };
  const project = async () => {
    const workspace = await request('/workspaces', { method: 'POST', body: { name: 'A real model workspace' } }); assert.equal(workspace.status, 200);
    const result = await request(`/projects/${workspace.body.id}`, { method: 'POST', body: { name: 'Helper project', language: 'javascript' } }); assert.equal(result.status, 200); return result.body;
  };
  return { provider, database, request, project };
}

test('existing workspace → project → versioned save journey preserves membership, rejects traversal and prevents concurrent lost updates', async t => {
  const app = await platform(t); const project = await app.project();
  assert.equal((await app.request(`/projects/${project.id}`, { user: 'user-b' })).status, 404);
  assert.equal((await app.request(`/projects/workspace/${project.workspaceId}`, { user: 'user-b' })).status, 404);
  assert.equal((await app.request(`/projects/${project.id}/files`, { method: 'PUT', body: { files: [{ name: '../escape.js', content: 'x', language: 'javascript' }], version: 0 } })).status, 400);
  const save = content => app.request(`/projects/${project.id}/files`, { method: 'PUT', body: { version: 0, files: [{ name: 'main.js', content, language: 'javascript' }] } });
  const results = await Promise.all([save('export const first = 1;'), save('export const second = 2;')]); assert.deepEqual(results.map(value => value.status).sort(), [200, 409]);
  const stored = await app.request(`/projects/${project.id}`); assert.equal(stored.body.version, 1); assert.equal(stored.body.files.length, 1);
  assert.equal((await app.request('/workspaces', { method: 'POST', body: { name: {} } })).status, 400);
  assert.equal(app.provider.calls.length, 0);
});
test('AI project scaffolding failures do not silently fall back to a starter template or persist a fake generated project', async t => {
  const app = await platform(t, { gemini: (_call, state) => state.json(geminiResponse('')) });
  const workspace = await app.request('/workspaces', { method: 'POST', body: { name: 'Scaffold workspace' } });
  const result = await app.request(`/projects/${workspace.body.id}`, { method: 'POST', body: { name: 'Broken scaffold', generateWithAI: true } });
  assert.equal(result.status, 502); assert.equal([...app.database.records.keys()].some(key => key.startsWith('projects/')), false);
});
test('marketplace installation refuses existing files instead of overwriting project code', async t => {
  const app = await platform(t); const project = await app.project();
  await app.database.collection('marketplace_items').doc('template').create({ type: 'template', downloads: 0, files: [{ name: 'main.js', content: 'Overwrite attack', language: 'javascript' }] });
  const result = await app.request('/market/template/install', { method: 'POST', body: { projectId: project.id } });
  assert.equal(result.status, 409); assert.deepEqual((await app.request(`/projects/${project.id}`)).body.files, project.files); assert.equal(app.database.records.get('marketplace_items/template').downloads, 0);
});
test('feed creation validates malformed input; transactional likes/comments preserve concurrent updates and do not return account secrets', async t => {
  const app = await platform(t);
  await app.database.collection('users').doc('user-a').create({ username: 'a', name: 'Developer A', password: 'fixture-not-a-production-password', accessToken: 'fixture-private-field' });
  assert.equal((await app.request('/posts', { method: 'POST', body: { text: {}, code: [] } })).status, 400);
  const created = await app.request('/posts', { method: 'POST', body: { text: 'A useful post', author: 'forged' } }); assert.equal(created.status, 200); assert.equal(created.body.author.id, 'user-a'); assert.equal(created.body.author.password, undefined);
  const id = created.body.id;
  const likes = await Promise.all(['user-a', 'user-b'].map(user => app.request(`/posts/${id}/like`, { method: 'PATCH', user }))); assert.ok(likes.every(result => result.status === 200));
  const comments = await Promise.all(['one', 'two'].map(text => app.request(`/posts/${id}/comment`, { method: 'POST', body: { text } }))); assert.ok(comments.every(result => result.status === 200));
  const post = (await app.request('/posts', { user: null })).body[0]; assert.deepEqual(post.likes.sort(), ['user-a', 'user-b']); assert.equal(post.comments.length, 2); assert.equal(post.author.accessToken, undefined);
  assert.equal((await app.request(`/posts/${id}/comment`, { method: 'POST', body: { text: { invalid: true } } })).status, 400);
});
test('unconfigured legacy persistence returns unavailable, never a successful empty workspace/feed/catalogue', async t => {
  const app = await platform(t); firebaseAdmin.db = null;
  for (const path of ['/workspaces', '/posts', '/market']) assert.equal((await app.request(path)).status, 503);
});
test('legacy AI project-query uses actual project source/history, is bounded, persists only actual responses and checks membership', async t => {
  const app = await platform(t, { gemini: (_call, state) => state.json(geminiResponse('A bounded fixture answer.')) }); const project = await app.project();
  const result = await app.request('/ai/agent', { method: 'POST', body: { action: 'project-query', projectId: project.id, message: 'Explain this project' } });
  assert.equal(result.status, 200); assert.equal(result.body.result, 'A bounded fixture answer.');
  const call = app.provider.calls.find(item => item.url.includes('generativelanguage.googleapis.com')); assert.ok(call); assert.equal(call.body.generationConfig.maxOutputTokens, 8192); assert.match(JSON.stringify(call.body.contents), /main.js/);
  assert.equal(app.database.records.get(`projects/${project.id}`).chatHistory.length, 2);
  assert.equal((await app.request('/ai/copilot', { method: 'POST', user: 'user-b', body: { action: 'project-query', projectId: project.id, message: 'Read another user code' } })).status, 404);
});
// An actual tiny PDF with a real xref table, generated in memory. PDF parsing is
// NOT mocked; only the subsequent external Gemini response is mocked.
function pdf(pages = 1) {
  const text = 'A candidate with JavaScript engineering experience and practical testing skills.';
  const stream = `BT /F1 12 Tf 40 720 Td (${text}) Tj ET`;
  const contentRef = 3 + pages; const fontRef = contentRef + 1;
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', `<< /Type /Pages /Kids [${Array.from({ length: pages }, (_, index) => `${index + 3} 0 R`).join(' ')}] /Count ${pages} >>`, ...Array.from({ length: pages }, () => `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentRef} 0 R /Resources << /Font << /F1 ${fontRef} 0 R >> >> >>`), `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  let value = '%PDF-1.4\n'; const offsets = [0];
  for (const [index, object] of objects.entries()) { offsets.push(Buffer.byteLength(value)); value += `${index + 1} 0 obj\n${object}\nendobj\n`; }
  const xref = Buffer.byteLength(value); value += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(value);
}
for (const extension of ['txt', 'pdf']) test(`authenticated ${extension.toUpperCase()} resume upload runs real multipart/${extension === 'pdf' ? 'PDF extraction' : 'text parsing'} and returns only validated provider analysis`, async t => {
  const app = await platform(t, { gemini: (_call, state) => state.json(geminiResponse(JSON.stringify(analysis))) });
  const form = new FormData(); form.set('file', new Blob([extension === 'pdf' ? pdf() : 'A candidate with JavaScript engineering experience and practical testing skills.']), `resume.${extension}`);
  const result = await app.request('/ai/resume-upload', { method: 'POST', form }); assert.equal(result.status, 200); assert.deepEqual(result.body, analysis);
  assert.match(JSON.stringify(app.provider.calls.at(-1).body), /JavaScript engineering/);
});
test('resume multipart bounds, invalid analysis and missing AI configuration are explicit errors, never zero-score fake results', async t => {
  const app = await platform(t, { gemini: (_call, state) => state.json(geminiResponse('{malformed')) });
  let result = await app.request('/ai/resume', { method: 'POST', body: { text: 'A sufficiently detailed resume with relevant experience.' } }); assert.equal(result.status, 502); assert.equal(result.body.score, undefined);
  const form = new FormData(); form.set('file', new Blob(['x'.repeat(2 * 1024 * 1024 + 1)]), 'oversize.txt'); assert.equal((await app.request('/ai/resume-upload', { method: 'POST', form })).status, 413);
  delete process.env.GEMINI_API_KEY;
  result = await app.request('/ai/resume', { method: 'POST', body: { text: 'A sufficiently detailed resume with relevant experience.' } }); assert.equal(result.status, 503); assert.equal(result.body.score, undefined);
});


test('PDF extraction runs in a bounded worker: invalid input and a forced deadline reject without blocking or contacting AI', async () => {
  const { extractResumePdf } = await import('../services/resumeTextService.js');
  await assert.rejects(extractResumePdf(Buffer.from('not a real PDF')), error => error.status === 400);
  const started = Date.now();
  await assert.rejects(extractResumePdf(Buffer.from('not a real PDF'), { timeoutMs: 1 }), error => error.status === 413 && /time limit/.test(error.message));
  assert.ok(Date.now() - started < 2_000);
  await assert.rejects(extractResumePdf(Buffer.alloc(2 * 1024 * 1024 + 1)), error => error.status === 413);
});

test('multibyte comments/likes respect the Firestore byte budget and retained AI chat is bounded by bytes as well as count', async t => {
  const app = await platform(t); const { default: Post } = await import('../models/Post.js'); const { default: Project } = await import('../models/Project.js');
  await app.database.collection('posts').doc('large').create({ text: 'a'.repeat(899_500), comments: [], likes: [] });
  await assert.rejects(Post.addComment('large', { user: 'user-a', text: '😀'.repeat(1000) }), error => error.status === 413);
  assert.equal(app.database.records.get('posts/large').comments.length, 0);
  await app.database.collection('posts').doc('full').create({ text: 'a'.repeat(899_995), comments: [], likes: [] });
  await assert.rejects(Post.toggleLike('full', 'user-a'), error => error.status === 413);
  assert.equal(app.database.records.get('posts/full').likes.length, 0);
  const project = await app.project(); await Project.appendChat(project.id, Array.from({ length: 30 }, () => ({ role: 'model', content: '😀'.repeat(5000) })));
  const history = app.database.records.get(`projects/${project.id}`).chatHistory; assert.ok(history.length < 30); assert.ok(Buffer.byteLength(JSON.stringify(history)) <= 200_000);
});


test('real PDFs over the page cap are rejected, and per-process worker concurrency is bounded', async () => {
  const { extractResumePdf } = await import('../services/resumeTextService.js');
  await assert.rejects(extractResumePdf(pdf(21)), error => error.status === 413);
  const first = extractResumePdf(pdf()); const second = extractResumePdf(pdf());
  await assert.rejects(extractResumePdf(pdf()), error => error.status === 429);
  for (const text of await Promise.all([first, second])) assert.match(text, /JavaScript engineering experience/);
});
test('incomplete Gemini output never becomes a successful scaffold, project record or resume score', async t => {
  const app = await platform(t, { gemini: (_call, state) => state.json({ candidates: [{ content: { role: 'model', parts: [{ text: 'Partial provider output' }] }, finishReason: 'MAX_TOKENS' }] }) });
  const workspace = await app.request('/workspaces', { method: 'POST', body: { name: 'Incomplete-output workspace' } });
  assert.equal((await app.request(`/projects/${workspace.body.id}`, { method: 'POST', body: { name: 'Truncated scaffold', generateWithAI: true } })).status, 502);
  assert.equal([...app.database.records.keys()].some(key => key.startsWith('projects/')), false);
  assert.equal((await app.request('/ai/resume', { method: 'POST', body: { text: 'An engineering resume with actual qualifications and testing experience.' } })).status, 502);
});
