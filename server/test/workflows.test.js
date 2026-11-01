import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { fakeFirestore } from './helpers/firestore.js';
import { mockProviders, baseSha } from './helpers/providers.js';
import { configureFirestore, getRun } from '../services/firebaseService.js';
import { signSession } from '../config/session.js';
import { proposalHash } from '../engines/orchestrator.js';
import { createV2Router } from '../routes/v2.js';

process.env.VERCEL = '1';
process.env.NODE_ENV = 'production';
const { createApp } = await import('../server.js');
async function workflow(t, configuration = {}, overrides = {}) {
  const providers = mockProviders(t, configuration);
  const firestore = fakeFirestore(); configureFirestore(firestore);
  const server = http.createServer(createApp({ v2: createV2Router(overrides) }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); configureFirestore(null); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const request = async (path, { user = 'user-a', body, method = body === undefined ? 'GET' : 'POST', token } = {}) => {
    const response = await fetch(`${origin}/api/v2${path}`, { method, headers: { ...(user ? { Authorization: `Bearer ${token || signSession(user)}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  const start = mode => request('/run', { body: { input: 'Improve the helper with a minimal, safe change', mode, requestId: 'test-request' } });
  const mutations = () => providers.calls.filter(call => call.url.startsWith('https://api.github.com') && ['PUT', 'POST', 'PATCH', 'DELETE'].includes(call.method));
  return { providers, firestore, request, start, mutations };
}

test('WORKFLOW 1 / Manual: HTTP intent → OpenAI → pinned context → plan → developer → QA → suggestion and persistent history, zero GitHub mutations', async t => {
  const app = await workflow(t);
  const result = await app.start('manual');
  assert.equal(result.status, 200); assert.equal(result.body.status, 'suggested');
  assert.equal(result.body.decision.decision, 'suggest'); assert.equal(result.body.qa.status, 'passed');
  assert.deepEqual(result.body.qa.executedTests, []);
  assert.equal(app.providers.aiCalls.length, 3); assert.equal(app.mutations().length, 0);
  const stored = (await app.request(`/runs/${result.body.runId}`)).body.run;
  assert.ok(stored.intent.acceptanceCriteria.length); assert.ok(stored.plan.tasks.length);
  assert.equal(stored.proposal.baseSha, baseSha); assert.equal(stored.proposal.changes[0].expectedSha.length, 40);
  assert.deepEqual(stored.usage.map(item => item.totalTokens), [150, 150, 150]);
  for (const stage of ['intent', 'planner', 'developer', 'qa', 'design', 'decision']) assert.ok(stored.events.some(event => event.step === stage && ['completed', 'passed'].includes(event.status)), stage);
  const history = await app.request('/runs?limit=1');
  assert.equal(history.status, 200); assert.equal(history.body.runs[0].id, stored.id); assert.equal(history.body.runs[0].proposal, undefined);
  assert.equal((await app.request(`/runs/${stored.id}`, { user: 'user-b' })).status, 404);
  assert.deepEqual((await app.request('/runs', { user: 'user-b' })).body.runs, []);
  const developerRequest = app.providers.aiCalls[2].body;
  assert.match(developerRequest.input, /export const value = 1/);
  assert.match(developerRequest.input, /src\/helper\.js/); assert.equal(developerRequest.store, false);
});

test('WORKFLOW 2 / Approval: exact persisted envelope, owner-only approval, branch → SHA-aware commit → genuine-shaped PR; repeat/stale approvals never execute', async t => {
  const app = await workflow(t);
  const result = await app.start('approval');
  assert.equal(result.status, 200); assert.equal(result.body.status, 'pending_approval'); assert.equal(app.mutations().length, 0);
  const { runId, approvalHash, proposal } = result.body;
  assert.equal(approvalHash, proposalHash(proposal));
  assert.equal((await app.request(`/runs/${runId}/approve`, { user: null, body: { approvalHash } })).status, 401);
  assert.equal((await app.request(`/runs/${runId}/approve`, { user: 'user-b', body: { approvalHash } })).status, 404);
  assert.equal((await app.request(`/runs/${runId}/approve`, { body: { approvalHash: 'f'.repeat(64) } })).status, 409);
  assert.equal(app.mutations().length, 0);
  const approved = await app.request(`/runs/${runId}/approve`, { body: { approvalHash } });
  assert.equal(approved.status, 200); assert.equal(approved.body.status, 'pull_request');
  assert.match(approved.body.branch, /^devsphere\/v2-/); assert.equal(approved.body.pullNumber, 1);
  assert.equal(app.providers.branches.get('trunk'), baseSha);
  assert.equal(app.providers.pulls.get(1).base.ref, 'trunk');
  assert.match(approved.body.pullRequest, /^https:\/\/github.com\/example\/project\/pull\/1$/);
  const stored = (await app.request(`/runs/${runId}`)).body.run;
  assert.equal(stored.approvalRecord.userId, 'user-a'); assert.equal(stored.approvalRecord.approvalHash, approvalHash);
  assert.ok(stored.events.some(event => event.step === 'approval' && event.status === 'approved'));
  assert.ok(stored.events.some(event => event.step === 'github-pr' && event.status === 'completed'));
  const total = app.mutations().length;
  assert.equal((await app.request(`/runs/${runId}/approve`, { body: { approvalHash } })).status, 409);
  assert.equal((await app.request(`/runs/${runId}/reject`, { body: { approvalHash } })).status, 409);
  assert.equal(app.mutations().length, total);
  assert.equal((await app.request(`/runs/${runId}`)).body.run.status, 'pull_request');
});

test('approval claims are atomic under concurrent approvals', async t => {
  const app = await workflow(t);
  const { body: { runId, approvalHash } } = await app.start('approval');
  const results = await Promise.all([1, 2].map(() => app.request(`/runs/${runId}/approve`, { body: { approvalHash } })));
  assert.deepEqual(results.map(item => item.status).sort(), [200, 409]);
  assert.equal(app.providers.pulls.size, 1);
});

test('approval vs rejection race cannot reverse an executing or completed approval', async t => {
  const app = await workflow(t);
  const { body: { runId, approvalHash } } = await app.start('approval');
  const results = await Promise.all(['approve', 'reject'].map(action => app.request(`/runs/${runId}/${action}`, { body: { approvalHash } })));
  assert.deepEqual(results.map(item => item.status).sort(), [200, 409]);
  const run = await getRun(runId, 'user-a');
  assert.ok(['rejected', 'pull_request'].includes(run.status));
  assert.equal(app.providers.pulls.size, run.status === 'rejected' ? 0 : 1);
});

test('approval rechecks the full proposal inside its transaction, including repository and base SHA', async t => {
  let tamper = false;
  let database;
  const app = await workflow(t, {}, { getRun: async (...args) => {
    const snapshot = await getRun(...args);
    if (tamper && snapshot) { const record = database.records.get(`devsphereRuns/${snapshot.id}`); record.proposal.repository = 'someone/else'; }
    return snapshot;
  } });
  database = app.firestore;
  const { body: { runId, approvalHash } } = await app.start('approval');
  tamper = true;
  assert.equal((await app.request(`/runs/${runId}/approve`, { body: { approvalHash } })).status, 409);
  assert.equal(app.mutations().length, 0);
});

for (const item of [
  { mode: 'assisted', risk: 'low', confidence: 95, expected: 'pull_request' },
  { mode: 'assisted', risk: 'medium', confidence: 95, expected: 'pending_approval' },
  { mode: 'assisted', risk: 'high', confidence: 95, expected: 'pending_approval' },
  { mode: 'assisted', risk: 'low', confidence: 20, expected: 'suggested' },
  { mode: 'assisted', risk: 'high', confidence: 20, expected: 'blocked' },
  { mode: 'full-auto', risk: 'low', confidence: 70, expected: 'pull_request' },
  { mode: 'full-auto', risk: 'low', confidence: 69, expected: 'suggested' },
  { mode: 'full-auto', risk: 'medium', confidence: 99, expected: 'pending_approval' },
  { mode: 'full-auto', risk: 'high', confidence: 99, expected: 'pending_approval' },
  { mode: 'full-auto', risk: 'high', confidence: 10, expected: 'blocked' }
]) test(`WORKFLOW ${item.mode === 'assisted' ? '3 / Assisted' : '4 / Full Auto'}: ${item.risk} risk, ${item.confidence}% → ${item.expected}`, async t => {
  const plan = { tasks: ['Update helper'], priority: 'normal', impact: 'file', risk: item.risk, confidence: item.confidence, issue: 'A narrow issue', suggestedFix: 'A small patch' };
  const app = await workflow(t, { plan });
  const result = await app.start(item.mode);
  assert.equal(result.status, 200); assert.equal(result.body.status, item.expected);
  assert.equal(app.providers.pulls.size, item.expected === 'pull_request' ? 1 : 0);
  if (item.expected !== 'pull_request') assert.equal(app.mutations().length, 0);
});

for (const mode of ['approval', 'assisted', 'full-auto']) test(`${mode} never bypasses failed or inconclusive QA`, async t => {
  const app = await workflow(t, { generated: { changes: [{ path: 'src/helper.js', operation: 'update', content: 'export const = broken;', reason: 'Invalid source' }] } });
  const result = await app.start(mode);
  assert.equal(result.body.status, 'blocked'); assert.equal(result.body.qa.status, 'failed'); assert.equal(app.mutations().length, 0);
  const css = await workflow(t, { generated: { changes: [{ path: 'new.css', operation: 'create', content: 'body { color: blue; }', reason: 'Unverified CSS syntax' }] } });
  const inconclusive = await css.start(mode);
  assert.equal(inconclusive.body.qa.status, 'inconclusive'); assert.equal(inconclusive.body.status, 'suggested'); assert.equal(css.mutations().length, 0);
});

test('stale default branch after approval produces an auditable conflict, not a stale PR', async t => {
  const app = await workflow(t);
  const { body: { runId, approvalHash } } = await app.start('approval');
  app.providers.branches.set('trunk', 'b'.repeat(40));
  const result = await app.request(`/runs/${runId}/approve`, { body: { approvalHash } });
  assert.equal(result.status, 409); assert.equal(result.body.code, 'GITHUB_CONFLICT'); assert.equal(app.mutations().length, 0);
  const stored = await getRun(runId, 'user-a');
  assert.equal(stored.status, 'failed'); assert.ok(stored.events.some(event => event.status === 'failed'));
});

test('partial GitHub commits are recorded on the isolated branch and never presented as a successful PR', async t => {
  const app = await workflow(t, {
    generated: { changes: [{ path: 'one.md', operation: 'create', content: 'First change', reason: 'First change' }, { path: 'two.md', operation: 'create', content: 'Second change', reason: 'Second change' }] },
    github: (call, state) => call.method === 'PUT' && call.path.endsWith('/two.md') ? state.json({ message: 'Conflict' }, 409) : null
  });
  const result = await app.start('assisted');
  assert.equal(result.status, 409); assert.ok(result.body.runId);
  const stored = await getRun(result.body.runId, 'user-a');
  assert.equal(stored.status, 'failed'); assert.equal(stored.partialCommitPaths[0], 'one.md'); assert.ok(stored.commitSha);
  assert.equal(stored.pullRequest, undefined); assert.equal(app.providers.pulls.size, 0);
  assert.equal(app.providers.branches.get('trunk'), baseSha);
});

test('failed AI generation persists earlier intent/plan and error evidence without placeholder proposals', async t => {
  const app = await workflow(t, { generated: { changes: [] } });
  const result = await app.start('assisted');
  assert.equal(result.status, 502); assert.equal(result.body.code, 'OPENAI_INVALID_OUTPUT');
  const stored = await getRun(result.body.runId, 'user-a');
  assert.equal(stored.status, 'failed'); assert.ok(stored.intent); assert.ok(stored.plan); assert.equal(stored.proposal, null);
  assert.equal(app.mutations().length, 0);
});

test('invalid inputs, expired identities, non-operators and unavailable persistence fail closed at HTTP boundaries', async t => {
  const app = await workflow(t);
  assert.equal((await app.request('/run', { user: null, body: { input: 'A sufficient request', mode: 'manual' } })).status, 401);
  assert.equal((await app.request('/run', { user: 'outsider', body: { input: 'A sufficient request', mode: 'manual' } })).status, 403);
  assert.equal((await app.request('/runs?limit=1.5')).status, 400);
  assert.equal((await app.request('/run', { body: { input: {}, mode: 'approval' } })).status, 400);
  assert.equal((await app.request('/runs/%2Funsafe')).status, 400);
  const { default: jwt } = await import('jsonwebtoken');
  assert.equal((await app.request('/runs', { token: jwt.sign({ user: { id: 'user-a' } }, process.env.JWT_SECRET, { expiresIn: -1 }) })).status, 401);
  configureFirestore(null);
  assert.equal((await app.start('manual')).status, 503);
  assert.equal(app.providers.aiCalls.length, 0); assert.equal(app.mutations().length, 0);
});

test('a default branch advance during commit execution prevents PR creation and preserves the isolated committed branch as failure evidence', async t => {
  const app = await workflow(t, { github: (call, state) => { if (call.method === 'PUT') state.branches.set('trunk', 'f'.repeat(40)); } });
  const result = await app.start('assisted'); assert.equal(result.status, 409); assert.match(result.body.error, /Default branch advanced/);
  const record = await getRun(result.body.runId, 'user-a'); assert.equal(record.status, 'failed'); assert.ok(record.commitSha); assert.ok(record.branch); assert.equal(app.providers.pulls.size, 0);
});
test('an ambiguous branch-create response records its candidate branch as unknown and never retries or claims a PR', async t => {
  const app = await workflow(t, { github: (call, state) => call.path.endsWith('/git/refs') && call.method === 'POST' ? state.json({ message: 'Mock provider outage' }, 503) : null });
  const result = await app.start('assisted'); assert.equal(result.status, 502);
  const record = await getRun(result.body.runId, 'user-a'); assert.equal(record.executionState, 'unknown'); assert.ok(record.branch.startsWith('devsphere/')); assert.equal(record.pullRequest, undefined);
  assert.equal(app.providers.calls.filter(call => call.path.endsWith('/git/refs') && call.method === 'POST').length, 1);
});
