import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import http from 'node:http';
import { createHmac, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, readFile, writeFile, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import axios from 'axios';
import firebaseAdmin from '../firebaseAdmin.js';
import Project from '../models/Project.js';
import Workspace from '../models/Workspace.js';
import { fakeFirestore } from './helpers/firestore.js';
import { mockProviders } from './helpers/providers.js';
import { configureFirestore } from '../services/firebaseService.js';
import { createWebhookRouter } from '../routes/webhook.js';
import authRoutes from '../routes/auth.js';
import gitRoutes from '../routes/git.js';
import marketplaceRoutes from '../routes/marketplace.js';
import codeRoutes from '../routes/code.js';
import aiRoutes from '../routes/ai.js';
import { signSession, getSessionSecret, verifySession } from '../config/session.js';
import { originAllowed } from '../config/cors.js';

async function listen(t, app) {
  const server = http.createServer(app); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return async (path, { user = 'user-a', method = 'GET', body, raw, headers = {} } = {}) => {
    const response = await fetch(`${origin}${path}`, { method, headers: { ...(user ? { Authorization: `Bearer ${signSession(user)}` } : {}), ...((body || raw) ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: raw || (body ? JSON.stringify(body) : undefined), redirect: 'manual' });
    return { status: response.status, headers: response.headers, text: await response.text() };
  };
}
function setEnvironment(t, values) {
  const old = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]])); Object.assign(process.env, values);
  t.after(() => { for (const [key, value] of Object.entries(old)) if (value === undefined) delete process.env[key]; else process.env[key] = value; });
}
async function webhook(t) {
  const providers = mockProviders(t);
  setEnvironment(t, { GITHUB_WEBHOOK_SECRET: 'test-only-webhook-secret', VERCEL_WEBHOOK_SECRET: 'test-only-vercel-webhook-secret' });
  const database = fakeFirestore(); configureFirestore(database); t.after(() => configureFirestore(null));
  const project = { id: 'project-a', workspaceId: 'workspace-a', configuration: { repository: 'example/project' } };
  const workspace = { owner: 'user-a', members: ['user-a'] };
  const emitted = [];
  const app = express(); app.use(express.json({ verify(req, _res, buffer) { req.rawBody = Buffer.from(buffer); } }));
  app.use('/webhook', createWebhookRouter({ findProject: async id => id === project.id ? project : null, findWorkspace: async () => workspace, getProjectForUser: async (id, userId) => {
    if (id !== project.id || userId !== 'user-a') throw Object.assign(new Error('Project not found.'), { status: 404 }); return project;
  }, emitRoomEvent: (...args) => emitted.push(args) }));
  const request = await listen(t, app);
  const raw = '{ "repository": {"full_name":"example/project"}, "after":"test-commit" }';
  const signed = body => ({ 'x-github-event': 'push', 'x-hub-signature-256': `sha256=${createHmac('sha256', process.env.GITHUB_WEBHOOK_SECRET).update(body).digest('hex')}` });
  return { providers, database, emitted, request, raw, signed };
}

test('unsigned webhooks and missing verification configuration can never invoke AI/GitHub or write audit history', async t => {
  const app = await webhook(t);
  assert.equal((await app.request('/webhook?projectId=project-a', { method: 'POST', user: null, raw: app.raw })).status, 400);
  assert.equal((await app.request('/webhook?projectId=project-a', { method: 'POST', user: null, raw: app.raw, headers: { 'x-github-event': 'push' } })).status, 401);
  delete process.env.GITHUB_WEBHOOK_SECRET;
  assert.equal((await app.request('/webhook?projectId=project-a', { method: 'POST', user: null, raw: app.raw, headers: { 'x-github-event': 'push' } })).status, 503);
  assert.equal(app.database.records.size, 0); assert.equal(app.providers.calls.length, 0);
});
test('signed raw-byte webhooks persist real evidence before acknowledgement, deduplicate replays and never fabricate errors or bypass V2', async t => {
  const app = await webhook(t);
  const send = () => app.request('/webhook?projectId=project-a', { method: 'POST', user: null, raw: app.raw, headers: app.signed(app.raw) });
  const first = await send(); assert.equal(first.status, 200); assert.equal(JSON.parse(first.text).status, 'recorded');
  assert.equal(app.database.records.size, 1);
  const event = [...app.database.records.values()][0]; assert.equal(event.type, 'PROVIDER_EVENT'); assert.equal(event.error, undefined); assert.equal(event.execution, 'not-requested');
  assert.equal(JSON.parse((await send()).text).status, 'duplicate'); assert.equal(app.database.records.size, 1);
  assert.equal(app.providers.calls.length, 0); assert.equal(app.emitted[0][0], 'devsphere:user:user-a');
  assert.equal((await app.request('/webhook?projectId=project-a', { method: 'POST', user: null, raw: app.raw + ' ', headers: app.signed(app.raw) })).status, 401);
});
test('webhook failure evidence is scoped to the configured repository and authorized project history', async t => {
  const app = await webhook(t);
  const raw = JSON.stringify({ repository: { full_name: 'example/project' }, action: 'completed', check_run: { name: 'build', conclusion: 'failure', output: { summary: 'TypeError: actual provider evidence' } } });
  const response = await app.request('/webhook?projectId=project-a', { method: 'POST', user: null, raw, headers: { ...app.signed(raw), 'x-github-event': 'check_run' } });
  assert.equal(response.status, 200);
  const event = [...app.database.records.values()][0]; assert.equal(event.type, 'ERROR_DETECTED'); assert.match(event.suggestedIntent, /actual provider evidence/);
  assert.equal((await app.request('/webhook/history?projectId=project-a', { user: null })).status, 401);
  assert.equal((await app.request('/webhook/history?projectId=project-a', { user: 'user-b' })).status, 404);
  assert.equal(JSON.parse((await app.request('/webhook/history?projectId=project-a')).text).events.length, 1);
  const other = JSON.stringify({ repository: { full_name: 'other/repo' } });
  assert.equal((await app.request('/webhook?projectId=project-a', { method: 'POST', user: null, raw: other, headers: app.signed(other) })).status, 403);
});
test('Vercel webhooks require their own signature, repository mapping and real provider event', async t => {
  const app = await webhook(t);
  const raw = JSON.stringify({ type: 'deployment.error', payload: { deployment: { id: 'dpl_test', meta: { githubCommitOrg: 'example', githubCommitRepo: 'project' } } } });
  const signature = createHmac('sha1', process.env.VERCEL_WEBHOOK_SECRET).update(raw).digest('hex');
  assert.equal((await app.request('/webhook?projectId=project-a', { method: 'POST', user: null, raw, headers: { 'x-vercel-signature': 'incorrect' } })).status, 401);
  assert.equal((await app.request('/webhook?projectId=project-a', { method: 'POST', user: null, raw, headers: { 'x-vercel-signature': signature } })).status, 200);
  assert.equal([...app.database.records.values()][0].type, 'VERCEL_ERROR_DETECTED'); assert.equal(app.providers.calls.length, 0);
});
test('legacy git history/commit and marketplace installation cannot touch another workspace project', async t => {
  mockProviders(t);
  t.mock.method(Project, 'findById', async () => ({ id: 'p', workspaceId: 'other' }));
  t.mock.method(Workspace, 'findById', async () => ({ members: ['someone-else'] }));
  const app = express(); app.use(express.json()); app.use('/git', gitRoutes); app.use('/market', marketplaceRoutes);
  const request = await listen(t, app);
  assert.equal((await request('/git/p/history')).status, 404);
  assert.equal((await request('/git/p/commit', { method: 'POST', body: { message: 'Unauthorized' } })).status, 404);
  const { default: MarketplaceItem } = await import('../models/MarketplaceItem.js');
  t.mock.method(MarketplaceItem, 'findById', async () => ({ type: 'template', files: [] }));
  let downloads = 0; t.mock.method(MarketplaceItem, 'incrementDownloads', async () => downloads++);
  assert.equal((await request('/market/item/install', { method: 'POST', body: { projectId: 'p' } })).status, 404);
  assert.equal(downloads, 0);
});
test('native git creates a real isolated project repository, handles nested/removed files and never commits this application checkout', async t => {
  await mkdir('server/git-cache', { recursive: true });
  const directory = await mkdtemp(join(process.cwd(), 'server/git-cache/test-'));
  setEnvironment(t, { GIT_CACHE_DIR: directory }); t.after(() => rm(directory, { recursive: true, force: true }));
  const appHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' });
  let files = [{ name: 'src/nested.js', content: 'export const one = 1;', language: 'javascript' }];
  t.mock.method(Project, 'findById', async () => ({ id: 'project-test', files }));
  const service = await import(`../services/gitService.js?test=${randomUUID()}`);
  const first = await service.commitCode('project-test', 'A real isolated commit', 'A Developer'); assert.equal(first.committed, true); assert.equal(first.commitId.length, 40);
  assert.match(await readFile(join(directory, 'project-test/src/nested.js'), 'utf8'), /one/);
  assert.equal((await service.getHistory('project-test')).length, 1);
  assert.equal((await service.commitCode('project-test', 'No changes', 'A Developer')).committed, false);
  files = [{ name: 'new.txt', content: 'Second commit', language: 'plaintext' }];
  await service.commitCode('project-test', 'File replacement', 'A Developer'); assert.equal((await service.getHistory('project-test')).length, 2);
  files = [{ name: '../escape.txt', content: 'unsafe', language: 'text' }];
  await assert.rejects(service.commitCode('project-test', 'Unsafe', 'A Developer'), /Unsafe/);
  assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }), appHead);
});
test('Firebase session sync verifies revocation and never returns stored password/credential fields', async t => {
  mockProviders(t); const database = fakeFirestore();
  const oldDatabase = firebaseAdmin.db; firebaseAdmin.db = database; t.after(() => { firebaseAdmin.db = oldDatabase; });
  const descriptor = Object.getOwnPropertyDescriptor(firebaseAdmin.admin, 'apps'); Object.defineProperty(firebaseAdmin.admin, 'apps', { value: [{}], configurable: true }); t.after(() => Object.defineProperty(firebaseAdmin.admin, 'apps', descriptor));
  const verified = []; t.mock.method(firebaseAdmin.admin, 'auth', () => ({ verifyIdToken: async (token, revoked) => { verified.push(revoked); if (token === 'expired') throw Object.assign(new Error('Expired'), { code: 'auth/id-token-expired' }); return { uid: 'firebase-user', email: 'test@example.com', name: 'Tester' }; } }));
  await database.collection('users').doc('firebase-user').create({ email: 'test@example.com', password: 'not-a-production-hash', accessToken: 'not-a-production-token' });
  const app = express(); app.use(express.json()); app.use('/auth', authRoutes); const request = await listen(t, app);
  const result = await request('/auth/user', { user: null, method: 'POST', body: { idToken: 'mock-id-token' } });
  assert.equal(result.status, 200); const value = JSON.parse(result.text); assert.equal(value.user.id, 'firebase-user'); assert.equal(value.user.password, undefined); assert.equal(value.user.accessToken, undefined); assert.deepEqual(verified, [true]);
  assert.equal((await request('/auth/user', { user: null, method: 'POST', body: { idToken: 'expired' } })).status, 401);
});
test('authentication rejects malformed credentials and OAuth callbacks without a matching signed browser state', async t => {
  mockProviders(t); const old = firebaseAdmin.db; firebaseAdmin.db = fakeFirestore(); t.after(() => { firebaseAdmin.db = old; });
  setEnvironment(t, { GITHUB_CLIENT_ID: 'test-only-client', GITHUB_CLIENT_SECRET: 'test-only-client-secret', GITHUB_REDIRECT_URI: 'https://devsphere.example/api/auth/github/callback', CLIENT_URL: 'https://devsphere.example' });
  const app = express(); app.use(express.json()); app.use('/auth', authRoutes); const request = await listen(t, app);
  assert.equal((await request('/auth/register', { user: null, method: 'POST', body: { email: {}, password: 12 } })).status, 400);
  assert.equal((await request('/auth/login', { user: null, method: 'POST', body: { email: null, password: [] } })).status, 400);
  const start = await request('/auth/github?client_state=fixture-client-state-at-least-32-characters', { user: null }); assert.equal(start.status, 302); assert.match(start.headers.get('set-cookie'), /HttpOnly/); assert.ok(new URL(start.headers.get('location')).searchParams.get('state'));
  const invalid = await request('/auth/github/callback?code=test&state=invalid', { user: null, headers: { origin: 'https://attacker.example' } });
  assert.equal(invalid.status, 302); assert.equal(invalid.headers.get('location'), 'https://devsphere.example/login?error=oauth_failed');
});
test('production JWT configuration fails closed and CORS does not trust arbitrary Vercel tenants', t => {
  setEnvironment(t, { NODE_ENV: 'production', JWT_SECRET: '', CLIENT_ORIGINS: 'https://devsphere.example', CLIENT_URL: 'https://devsphere.example' });
  assert.throws(getSessionSecret, /not configured/);
  assert.equal(originAllowed('https://devsphere.example'), true); assert.equal(originAllowed('https://attacker.vercel.app'), false); assert.equal(originAllowed('https://devsphere.example.attacker.test'), false);
});
test('existing code runner enforces authentication, supported compiler IDs, timeouts and provider failures', async t => {
  mockProviders(t);
  const app = express(); app.use(express.json()); app.use('/code', codeRoutes); const request = await listen(t, app);
  assert.equal((await request('/code/run', { user: null, method: 'POST', body: { code: 'x' } })).status, 401);
  assert.equal((await request('/code/run', { method: 'POST', body: { code: 'x', language_id: 74 } })).status, 422);
  const call = t.mock.method(axios, 'post', async (_url, _body, config) => { assert.ok(config.timeout); return { data: { program_message: 'hello', status: 0 } }; });
  assert.equal(JSON.parse((await request('/code/run', { method: 'POST', body: { code: 'console.log("hello")', language_id: 63 } })).text).stdout, 'hello');
  call.mock.mockImplementation(async () => { throw new Error('mock service unavailable'); });
  assert.equal((await request('/code/run', { method: 'POST', body: { code: 'x' } })).status, 502);
});
test('legacy AI routes require authentication and validate actions/inputs before contacting a provider', async t => {
  const providers = mockProviders(t);
  const app = express(); app.use(express.json()); app.use('/ai', aiRoutes); const request = await listen(t, app);
  assert.equal((await request('/ai/resume', { user: null, method: 'POST', body: { text: 'A resume' } })).status, 401);
  assert.equal((await request('/ai/copilot', { method: 'POST', body: { action: 'unsupported', code: 'x' } })).status, 400);
  assert.equal((await request('/ai/copilot', { method: 'POST', body: { action: 'explain', code: {} } })).status, 400);
  assert.equal(providers.calls.length, 0);
});

test('sessions require expiring HS256 identities, and production refuses a trivially weak signing key', t => {
  mockProviders(t);
  const valid = signSession('user-a'); assert.equal(verifySession(valid).id, 'user-a');
  assert.throws(() => verifySession(jwt.sign({ user: { id: 'user-a' } }, process.env.JWT_SECRET)), /expiration/);
  assert.throws(() => verifySession(jwt.sign({ user: { id: 'user-a' } }, process.env.JWT_SECRET, { algorithm: 'HS384', expiresIn: '1h' })), /algorithm/);
  setEnvironment(t, { NODE_ENV: 'production', JWT_SECRET: 'short' });
  assert.throws(getSessionSecret, /32 random bytes/);
});
test('GitHub OAuth cannot silently link a verified provider email to an existing password account without authenticating that account', async t => {
  mockProviders(t); const original = firebaseAdmin.db; const database = fakeFirestore(); firebaseAdmin.db = database; t.after(() => { firebaseAdmin.db = original; });
  setEnvironment(t, { GITHUB_CLIENT_ID: 'test-client', GITHUB_CLIENT_SECRET: 'test-client-secret', GITHUB_REDIRECT_URI: 'https://devsphere.example/api/auth/github/callback', CLIENT_URL: 'https://devsphere.example' });
  await database.collection('users').doc('password-account').create({ email: 'a@example.com', password: 'fixture-password-hash', authProvider: 'password' });
  t.mock.method(axios, 'post', async () => ({ data: { access_token: 'fixture-oauth-access' } }));
  t.mock.method(axios, 'get', async url => ({ data: url.endsWith('/emails') ? [{ email: 'a@example.com', verified: true, primary: true }] : { id: 123, login: 'fixture' } }));
  const app = express(); app.use('/auth', authRoutes); const request = await listen(t, app);
  const start = await request('/auth/github?client_state=fixture-client-state-at-least-32-characters', { user: null }); const state = new URL(start.headers.get('location')).searchParams.get('state');
  const response = await request(`/auth/github/callback?code=test-code&state=${encodeURIComponent(state)}`, { user: null, headers: { Cookie: start.headers.get('set-cookie').split(';')[0] } });
  assert.equal(response.headers.get('location'), 'https://devsphere.example/login?error=oauth_failed'); assert.equal(database.records.get('users/password-account').githubId, undefined);
});


test('cached Git repositories quarantine active hooks, injected configuration and metadata symlinks before any git command', async t => {
  await mkdir('server/git-cache', { recursive: true });
  const directory = await mkdtemp(join(process.cwd(), 'server/git-cache/traps-'));
  setEnvironment(t, { GIT_CACHE_DIR: directory }); t.after(() => rm(directory, { recursive: true, force: true }));
  t.mock.method(Project, 'findById', async () => ({ files: [{ name: 'safe.js', content: 'export const safe = true;', language: 'javascript' }] }));
  const service = await import(`../services/gitService.js?test=${randomUUID()}`);
  for (const id of ['hook', 'configuration', 'linked']) await service.commitCode(id, 'Safe initial commit');
  await writeFile(join(directory, 'hook/.git/hooks/pre-commit'), '#!/bin/sh\nexit 0');
  await assert.rejects(service.commitCode('hook', 'Blocked hook'), /hooks.*forbidden/);
  await writeFile(join(directory, 'configuration/.git/config'), '[core]\nrepositoryformatversion = 0\n[include]\npath = /outside/config\n');
  await assert.rejects(service.getHistory('configuration'), /Unsafe legacy.*configuration/);
  await symlink(join(directory, 'hook/.git/refs'), join(directory, 'linked/.git/escape'));
  await assert.rejects(service.getHistory('linked'), /Unsafe project git metadata/);
});

test('backend GitHub OAuth binds its signed callback to the initiating frontend browser nonce as well as its HttpOnly state cookie', async t => {
  mockProviders(t); const original = firebaseAdmin.db; firebaseAdmin.db = fakeFirestore(); t.after(() => { firebaseAdmin.db = original; });
  setEnvironment(t, { GITHUB_CLIENT_ID: 'test-client', GITHUB_CLIENT_SECRET: 'test-client-secret', GITHUB_REDIRECT_URI: 'https://devsphere.example/api/auth/github/callback', CLIENT_URL: 'https://devsphere.example' });
  t.mock.method(axios, 'post', async () => ({ data: { access_token: 'fixture-oauth-access' } }));
  t.mock.method(axios, 'get', async url => ({ data: url.endsWith('/emails') ? [{ email: 'new@example.com', verified: true, primary: true }] : { id: 456, login: 'new-owner' } }));
  const app = express(); app.use('/auth', authRoutes); const request = await listen(t, app);
  assert.equal((await request('/auth/github', { user: null })).status, 400);
  const clientState = 'frontend-fixture-nonce-at-least-32-characters'; const start = await request(`/auth/github?client_state=${clientState}`, { user: null }); assert.equal(start.status, 302);
  const state = new URL(start.headers.get('location')).searchParams.get('state'); assert.equal(jwt.verify(state, getSessionSecret()).clientState, clientState);
  const result = await request(`/auth/github/callback?code=fixture&state=${encodeURIComponent(state)}`, { user: null, headers: { Cookie: start.headers.get('set-cookie').split(';')[0] } });
  const destination = new URL(result.headers.get('location')); const fragment = new URLSearchParams(destination.hash.slice(1));
  assert.equal(destination.origin, 'https://devsphere.example'); assert.equal(fragment.get('state'), clientState); assert.ok(verifySession(fragment.get('token')).id); assert.equal(destination.search, '');
});
