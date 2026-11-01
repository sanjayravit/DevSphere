import test from 'node:test';
import assert from 'node:assert/strict';
import { mockProviders, baseSha, blobSha } from './helpers/providers.js';
import { generateIntent, generatePlan, createStructuredGenerator, INTENT_SCHEMA } from '../services/aiService.js';
import { getRepositoryContext, getRepositoryInfo, createBranch, createUniqueBranch, commitChanges, createPullRequest, getRequiredChecks } from '../services/githubService.js';
import { createDevAgent } from '../agents/devAgent.js';
import { qaAgent } from '../agents/qaAgent.js';
import { analyzeSystem } from '../engines/designEngine.js';

for (const response of [
  { name: 'incomplete', body: { status: 'incomplete', output_text: '{"summary":"valid-looking"}' }, code: 'OPENAI_INCOMPLETE' },
  { name: 'malformed JSON', body: { status: 'completed', output_text: '{broken' }, code: 'OPENAI_INVALID_OUTPUT' },
  { name: 'invalid schema', body: { status: 'completed', output_text: '{"summary":"x","steps":[1],"acceptanceCriteria":[]}' }, code: 'OPENAI_INVALID_OUTPUT' },
  { name: 'empty output', body: { status: 'completed', output_text: '' }, code: 'OPENAI_INVALID_OUTPUT' },
  { name: 'refusal', body: { status: 'completed', output: [{ content: [{ type: 'refusal', refusal: 'No' }] }], output_text: '{}' }, code: 'OPENAI_REFUSAL' }
]) test(`OpenAI rejects ${response.name} rather than returning a placeholder`, async () => {
  const generate = createStructuredGenerator(() => ({ responses: { create: async () => response.body } }));
  await assert.rejects(generate('A safe bounded request', 'intent', INTENT_SCHEMA), error => error.code === response.code);
});

test('OpenAI validates plan confidence and every task, not only JSON syntax', async t => {
  mockProviders(t, { plan: { tasks: ['valid', null], confidence: 120, risk: 'low', impact: 'file', priority: 'normal', issue: 'Issue', suggestedFix: 'Fix' } });
  await assert.rejects(generatePlan({ summary: 'x' }), error => error.code === 'OPENAI_INVALID_OUTPUT');
});
for (const status of [401, 403, 429, 503]) test(`OpenAI HTTP ${status} is an explicit provider error with no fake result`, async t => {
  const fixture = mockProviders(t, { ai: (_call, state) => state.json({ error: { message: 'mock error', type: 'provider_test' } }, status) });
  await assert.rejects(generateIntent('A meaningful change request'), error => error.code === (status === 429 ? 'OPENAI_RATE_LIMIT' : 'OPENAI_ERROR'));
  assert.equal(fixture.aiCalls.length, 1);
});
test('OpenAI uses bounded SDK retries and preserves token usage/request budgets', async t => {
  let count = 0;
  const fixture = mockProviders(t, { ai: (call, state) => {
    if (++count === 1) return state.json({ error: { message: 'Rate limit' } }, 429, { 'retry-after-ms': '1' });
    return state.json({ status: 'completed', model: 'mock-model', output_text: JSON.stringify({ summary: 'A change', steps: ['One step'], acceptanceCriteria: ['It works'] }), usage: { input_tokens: 12, output_tokens: 9, total_tokens: 21 } });
  } });
  process.env.OPENAI_MAX_RETRIES = '1';
  const usage = [];
  const result = await generateIntent('A meaningful change request', { onUsage: item => usage.push(item) });
  assert.equal(result.summary, 'A change'); assert.equal(fixture.aiCalls.length, 2);
  assert.equal(fixture.aiCalls[1].body.max_output_tokens, 1_500); assert.equal(fixture.aiCalls[1].body.store, false);
  assert.equal(usage[0].totalTokens, 21);
  const signal = AbortSignal.abort();
  await assert.rejects(generateIntent('A meaningful change request', { signal }), /timed out or was canceled/);
});
test('OpenAI rejects unbounded requests before contacting a provider', async () => {
  let called = false;
  const generate = createStructuredGenerator(() => { called = true; return {}; });
  await assert.rejects(generate('x'.repeat(90_001), 'intent', INTENT_SCHEMA), error => error.code === 'AI_REQUEST_LIMIT');
  assert.equal(called, false);
});

test('repository context pins every content request to an immutable commit and keeps paths outside the file window', async t => {
  const files = Object.fromEntries(Array.from({ length: 45 }, (_, index) => [`src/file-${String(index).padStart(2, '0')}.js`, `export const a${index} = ${index};`]));
  const fixture = mockProviders(t, { files });
  const context = await getRepositoryContext('example/project', undefined, { maxFiles: 2, query: 'file-44' });
  assert.equal(context.baseSha, baseSha); assert.equal(context.files.length, 2); assert.equal(context.treePaths.length, 45);
  assert.ok(context.files.some(file => file.path === 'src/file-44.js'));
  assert.ok(fixture.calls.filter(call => call.path.includes('/contents/')).every(call => new URL(call.url).searchParams.get('ref') === baseSha));
});
test('repository context excludes protected files, symlinks, secrets and unsupported artifacts before selecting files', async t => {
  const fixture = mockProviders(t, { files: { '.env': 'private', 'binary.bin': 'not source', 'src/unsafe.js': `const apiKey = "${'sk-' + 'x'.repeat(24)}";`, 'src/safe.js': 'export const ok = true;' } });
  const context = await getRepositoryContext('example/project');
  assert.deepEqual(context.files.map(file => file.path), ['src/safe.js']);
  assert.equal(fixture.calls.some(call => call.path.endsWith('/contents/.env')), false);
});
test('developer refuses an update outside inspected context even when the tree contains it', async () => {
  const developer = createDevAgent({ getContext: async () => ({ files: [{ path: 'src/read.js', sha: 'sha', content: 'read' }], treePaths: ['src/unread.js', 'src/read.js'], info: { fullName: 'o/r', defaultBranch: 'trunk' }, baseSha }), generateChanges: async () => ({ changes: [{ path: 'src/unread.js', operation: 'update', content: 'replacement' }] }) });
  await assert.rejects(developer({ repo: 'o/r', intent: { summary: 'x' }, plan: { tasks: [] } }), /complete contents/);
});
test('GitHub never writes to the dynamically resolved default branch or creates a PR from it', async t => {
  const fixture = mockProviders(t);
  const changes = [{ path: 'new.md', operation: 'create', content: 'A new file', expectedSha: null }];
  await assert.rejects(createBranch(undefined, 'trunk'), /feature branch/);
  await assert.rejects(commitChanges(undefined, 'trunk', changes), /default branch/);
  await assert.rejects(createPullRequest(undefined, 'trunk', 'trunk'), /isolated/);
  assert.equal(fixture.calls.some(call => ['PUT', 'POST', 'PATCH'].includes(call.method)), false);
});
test('GitHub generates distinct feature branches without a hardcoded default', async t => {
  const fixture = mockProviders(t);
  const [one, two] = await Promise.all([createUniqueBranch(), createUniqueBranch()]);
  assert.notEqual(one.branch, two.branch); assert.equal(one.base, 'trunk'); assert.equal(two.baseSha, baseSha);
  assert.equal(fixture.branches.get('trunk'), baseSha);
});
test('GitHub preflights all files before the first mutation when a later blob SHA is stale', async t => {
  const fixture = mockProviders(t); fixture.branches.set('devsphere/test', baseSha);
  await assert.rejects(commitChanges(undefined, 'devsphere/test', [{ path: 'new.md', operation: 'create', content: 'new', expectedSha: null }, { path: 'src/helper.js', operation: 'update', content: 'changed', expectedSha: 'stale-sha' }]), error => error.code === 'GITHUB_CONFLICT');
  assert.equal(fixture.calls.some(call => call.method === 'PUT'), false);
});
test('GitHub detects a concurrent feature-branch update without opening a PR', async t => {
  let reads = 0;
  const fixture = mockProviders(t, { github: (call, state) => {
    if (call.path.endsWith('/git/ref/heads/devsphere/test') && ++reads === 2) state.branches.set('devsphere/test', 'c'.repeat(40));
  } });
  fixture.branches.set('devsphere/test', baseSha);
  await assert.rejects(commitChanges(undefined, 'devsphere/test', [{ path: 'new.md', operation: 'create', content: 'new', expectedSha: null }]), error => error.code === 'GITHUB_CONFLICT');
  assert.equal(fixture.calls.some(call => call.method === 'PUT'), false);
});
for (const item of [{ status: 401, code: 'GITHUB_API_ERROR' }, { status: 429, code: 'GITHUB_RATE_LIMIT' }, { status: 503, code: 'GITHUB_API_ERROR' }]) test(`GitHub provider HTTP ${item.status} is propagated without claiming success`, async t => {
  mockProviders(t, { github: (_call, state) => state.json({ message: 'Provider unavailable' }, item.status) });
  await assert.rejects(getRepositoryInfo(), error => error.code === item.code);
});
test('GitHub rejects malformed successful provider responses', async t => {
  mockProviders(t, { github: (_call, state) => state.json({ unexpected: true }) });
  await assert.rejects(getRepositoryInfo(), error => error.code === 'GITHUB_INVALID_RESPONSE');
});
test('GitHub does not retry an ambiguous branch mutation', async t => {
  const fixture = mockProviders(t, { github: (call, state) => call.path.endsWith('/git/refs') ? state.json({ message: 'Upstream failure' }, 503) : null });
  process.env.GITHUB_MAX_RETRIES = '2';
  await assert.rejects(createUniqueBranch(), error => error.ambiguous === true);
  assert.equal(fixture.calls.filter(call => call.method === 'POST').length, 1);
});
test('QA never treats an empty proposal or unchecked source type as passed, and detects secrets in JavaScript', async () => {
  assert.equal((await qaAgent({ changes: [] })).status, 'inconclusive');
  assert.equal((await qaAgent({ changes: [{ path: 'x.py', content: 'this is not Python' }] })).status, 'inconclusive');
  assert.equal((await qaAgent({ changes: [{ path: 'x.js', content: `const key = "${'sk-' + 'x'.repeat(30)}";` }] })).status, 'failed');
  assert.equal((await qaAgent({ changes: [{ path: 'x.tsx', content: 'export const X = () => <div>Hello</div>;' }] })).status, 'inconclusive');
  assert.equal((await qaAgent({ changes: [{ path: 'x.cjs', content: 'module.exports = 1;' }] })).status, 'inconclusive');
});
test('design analysis cannot downgrade planner high risk or system impact, and recognizes auth context files', () => {
  const plan = { risk: 'high', impact: 'system', confidence: 90 };
  const result = analyzeSystem({ plan, changes: Array.from({ length: 4 }, (_, index) => ({ path: `${index}.md`, content: 'ok' })), qa: { status: 'passed' } });
  assert.equal(result.risk, 'high'); assert.equal(result.impact, 'system');
  assert.equal(analyzeSystem({ plan: { risk: 'low', impact: 'file', confidence: 99 }, changes: [{ path: 'client/src/context/AuthContext.jsx', content: 'safe-looking' }], qa: { status: 'passed' } }).risk, 'high');
});
test('required CI checks honor app identity and do not accept stale successful attempts', async t => {
  mockProviders(t, { github: (call, state) => call.path.endsWith('/check-runs') ? state.json({ check_runs: [
    { head_sha: baseSha, id: 1, name: 'validate', app: { id: 15368 }, status: 'completed', conclusion: 'success', started_at: '2026-01-01' },
    { head_sha: baseSha, id: 2, name: 'validate', app: { id: 15368 }, status: 'in_progress', conclusion: null, started_at: '2026-10-31' },
    { head_sha: baseSha, id: 3, name: 'validate', app: { id: 999 }, status: 'completed', conclusion: 'success', started_at: '2026-10-31' }
  ] }) : null });
  assert.equal((await getRequiredChecks(undefined, baseSha, 'trunk')).passed, false);
});
test('a successful legacy status cannot hide a failed required check with the same context', async t => {
  mockProviders(t, { github: (call, state) => {
    if (call.path.includes('/protection/')) return state.json({ contexts: ['validate'], checks: [] });
    if (call.path.endsWith('/check-runs')) return state.json({ check_runs: [{ head_sha: baseSha, id: 1, name: 'validate', status: 'completed', conclusion: 'failure', started_at: '2026-10-30' }] });
    if (call.path.endsWith('/statuses')) return state.json([{ id: 2, context: 'validate', state: 'success', created_at: '2026-10-31' }]);
  } });
  assert.equal((await getRequiredChecks(undefined, baseSha, 'trunk')).passed, false);
});

test('credential-bearing AI context is rejected before any provider call, including configured credentials without a recognizable prefix', async t => {
  const provider = mockProviders(t);
  await assert.rejects(generateIntent(`Please use ${process.env.GITHUB_TOKEN} in this request`), error => error.code === 'AI_UNSAFE_CONTEXT');
  assert.equal(provider.aiCalls.length, 0);
});
for (const malformed of ['invalid Base64', 'mismatched blob content']) test(`GitHub source context rejects ${malformed} before code generation`, async t => {
  mockProviders(t, { github: (call, state) => call.path.includes('/contents/') ? state.json({ type: 'file', sha: blobSha('export const value = 1;\n'), encoding: 'base64', content: malformed === 'invalid Base64' ? '!!not-base64!!' : Buffer.from('Wrong contents').toString('base64') }) : null });
  await assert.rejects(getRepositoryContext(), error => error.code === 'GITHUB_INVALID_RESPONSE');
});
test('deployment/configuration files cannot be mislabeled low risk even when the planner claims file-only impact', async () => {
  for (const path of ['vercel.json', 'firestore.rules']) {
    const result = analyzeSystem({ plan: { risk: 'low', impact: 'file', confidence: 99 }, changes: [{ path, content: '{}' }], qa: { status: 'passed' } });
    assert.equal(result.risk, 'high'); assert.equal(result.impact, 'system');
  }
});
test('GitHub bounds a retryable read and propagates timeouts without any mutation', async t => {
  const provider = mockProviders(t, { github: () => { throw new DOMException('mock timeout', 'TimeoutError'); } });
  process.env.GITHUB_MAX_RETRIES = '1';
  await assert.rejects(getRepositoryInfo(), error => error.code === 'GITHUB_NETWORK_ERROR');
  assert.equal(provider.calls.length, 2); assert.ok(provider.calls.every(call => call.method === 'GET' && call.signal));
});

test('non-UTF-8 repository bytes are not silently decoded with replacement characters and passed to code generation', async t => {
  const fixture = mockProviders(t, { files: { 'src/invalid.js': Buffer.from([0xc0, 0xaf, 0x3b]) } });
  await assert.rejects(getRepositoryContext('example/project'), error => error.code === 'GITHUB_EMPTY_CONTEXT');
  assert.equal(fixture.aiCalls.length, 0); assert.equal(fixture.calls.some(call => call.method === 'PUT'), false);
});
