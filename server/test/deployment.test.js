import { mockSandboxRun } from './helpers/qa.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { mockProviders } from './helpers/providers.js';
import { fakeFirestore } from './helpers/firestore.js';
import { configureFirestore, getRun, updateRun } from '../services/firebaseService.js';
import { createV2Router } from '../routes/v2.js';
import { signSession } from '../config/session.js';

function environment(t, values) {
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  Object.assign(process.env, values);
  t.after(() => { for (const [key, value] of Object.entries(previous)) if (value === undefined) delete process.env[key]; else process.env[key] = value; });
}
async function deploymentWorkflow(t, configuration = {}) {
  const providers = mockProviders(t, configuration);
  environment(t, { VERCEL_API_TOKEN: 'test-only-vercel-credential', VERCEL_PROJECT_ID: 'prj_test', VERCEL_GITHUB_REPO_ID: '12345', ENABLE_PRODUCTION_DEPLOYMENTS: 'true' });
  const database = fakeFirestore(); configureFirestore(database);
  const app = express(); app.use(express.json()); app.use('/v2', createV2Router({ runDevSphere: mockSandboxRun, ...configuration.routes }));
  const server = http.createServer(app); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); configureFirestore(null); });
  const post = async (path, body, user = 'user-a') => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/v2${path}`, { method: 'POST', headers: { Authorization: `Bearer ${signSession(user)}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    return { status: response.status, body: await response.json() };
  };
  const generated = await post('/run', { input: 'Improve the helper safely', mode: 'assisted' });
  assert.equal(generated.status, 200); assert.equal(generated.body.status, 'pull_request');
  const runId = generated.body.runId;
  const mergeSha = 'd'.repeat(40);
  const pull = providers.pulls.get(1);
  Object.assign(pull, { merged: true, merged_at: '2026-10-31T00:00:00Z', merge_commit_sha: mergeSha });
  providers.branches.set('trunk', mergeSha);
  return { providers, database, runId, pull, post, deploy: user => post(`/runs/${runId}/deploy`, {}, user), stored: () => getRun(runId, 'user-a'), vercelCalls: () => providers.calls.filter(call => call.url.startsWith('https://api.vercel.com')) };
}

for (const scenario of ['unmerged', 'wrong default branch', 'wrong repository', 'untracked head', 'default branch advanced', 'missing credentials', 'repository ID mismatch', 'deployment not enabled', 'failed CI', 'missing CI configuration']) test(`WORKFLOW 6 / deployment is skipped, NOT successful: ${scenario}`, async t => {
  const configuration = scenario === 'failed CI' ? { github: (call, state) => call.path.endsWith('/check-runs') ? state.json({ check_runs: [{ id: 1, name: 'validate', app: { id: 15368 }, status: 'completed', conclusion: 'failure' }] }) : null } : scenario === 'missing CI configuration' ? { github: (call, state) => call.path.includes('/protection/') ? state.json({ message: 'Not Found' }, 404) : null } : {};
  const app = await deploymentWorkflow(t, configuration);
  if (scenario === 'unmerged') app.pull.merged = false;
  if (scenario === 'wrong default branch') app.pull.base.ref = 'release';
  if (scenario === 'wrong repository') app.pull.base.repo.full_name = 'other/repo';
  if (scenario === 'untracked head') app.pull.head.sha = 'e'.repeat(40);
  if (scenario === 'default branch advanced') app.providers.branches.set('trunk', 'e'.repeat(40));
  if (scenario === 'missing credentials') delete process.env.VERCEL_API_TOKEN;
  if (scenario === 'repository ID mismatch') process.env.VERCEL_GITHUB_REPO_ID = '777';
  if (scenario === 'deployment not enabled') process.env.ENABLE_PRODUCTION_DEPLOYMENTS = 'false';
  const result = await app.deploy();
  assert.equal(result.status, 200); assert.equal(result.body.deployment.status, 'skipped'); assert.ok(result.body.deployment.reason);
  assert.equal((await app.stored()).status, 'deployment_skipped'); assert.equal(app.vercelCalls().length, 0);
  assert.ok((await app.stored()).events.some(event => event.step === 'deployment' && event.status === 'skipped'));
});
test('WORKFLOW 6 / merged default-branch CI gates → one Vercel request → persisted pending → refresh by ID → verified READY', async t => {
  let entered; let finish;
  const creating = new Promise(resolve => { entered = resolve; });
  const release = new Promise(resolve => { finish = resolve; });
  const app = await deploymentWorkflow(t, { vercel: async (call, state) => {
    if (call.method === 'POST') { entered(); await release; return state.json({ id: 'dpl_test', projectId: 'prj_test', readyState: 'BUILDING' }); }
    return state.json({ id: 'dpl_test', projectId: 'prj_test', readyState: 'READY', url: 'devsphere-test.vercel.app' });
  } });
  const first = app.deploy(); await creating;
  const second = await app.deploy(); assert.equal(second.status, 409);
  finish(); assert.equal((await first).status, 200);
  assert.equal((await app.stored()).status, 'deployment_pending');
  assert.equal(app.vercelCalls().filter(call => call.method === 'POST').length, 1);
  const request = app.vercelCalls()[0]; assert.equal(request.body.gitSource.ref, 'trunk'); assert.equal(request.body.gitSource.sha, app.pull.merge_commit_sha); assert.ok(request.signal);
  const ready = await app.deploy();
  assert.equal(ready.status, 200); assert.equal(ready.body.deployment.status, 'deployed'); assert.equal(ready.body.deployment.url, 'https://devsphere-test.vercel.app');
  assert.equal((await app.stored()).status, 'deployed'); assert.equal(app.vercelCalls().filter(call => call.method === 'POST').length, 1);
});
test('Vercel immediate READY and ERROR responses are not mislabeled pending or successful', async t => {
  const ready = await deploymentWorkflow(t, { vercel: (_call, state) => state.json({ id: 'dpl_ready', projectId: 'prj_test', readyState: 'READY', url: 'devsphere-test.vercel.app' }) });
  assert.equal((await ready.deploy()).body.deployment.status, 'deployed');
  const failure = await deploymentWorkflow(t, { vercel: (_call, state) => state.json({ id: 'dpl_failed', projectId: 'prj_test', readyState: 'ERROR' }) });
  assert.equal((await failure.deploy()).body.deployment.status, 'failed'); assert.equal((await failure.stored()).status, 'deployment_failed');
});
for (const scenario of ['malformed response', 'ambiguous provider failure', 'network timeout']) test(`uncertain Vercel creation is recorded as unknown and cannot create duplicate production deployments: ${scenario}`, async t => {
  const app = await deploymentWorkflow(t, { vercel: (_call, state) => {
    if (scenario === 'network timeout') throw new DOMException('mock timeout', 'TimeoutError');
    return scenario === 'malformed response' ? state.json({ unexpected: true }) : state.json({ error: { message: 'failure' } }, 503);
  } });
  const result = await app.deploy(); assert.equal(result.status, 502);
  const stored = await app.stored(); assert.equal(stored.status, 'deployment_unknown'); assert.equal(stored.deployment.status, 'unknown');
  assert.equal((await app.deploy()).status, 409); assert.equal(app.vercelCalls().length, 1);
});
test('deployment cannot be requested by another user, non-operator or a QA-failed run', async t => {
  const app = await deploymentWorkflow(t);
  assert.equal((await app.deploy('user-b')).status, 404);
  assert.equal((await app.deploy('outsider')).status, 403);
  app.database.records.get(`devsphereRuns/${app.runId}`).qa.status = 'failed';
  assert.equal((await app.deploy()).status, 409); assert.equal(app.vercelCalls().length, 0);
});

test('a failed Vercel refresh retains the known deployment ID and retries GET only, never a second creation', async t => {
  let reads = 0;
  const app = await deploymentWorkflow(t, { vercel: (call, state) => call.method === 'POST'
    ? state.json({ id: 'dpl_known', projectId: 'prj_test', readyState: 'BUILDING' })
    : ++reads === 1 ? state.json({ error: 'mock read outage' }, 503)
      : state.json({ id: 'dpl_known', projectId: 'prj_test', readyState: 'READY', url: 'devsphere-test.vercel.app' }) });
  assert.equal((await app.deploy()).body.deployment.status, 'pending');
  assert.equal((await app.deploy()).status, 502);
  assert.equal((await app.stored()).status, 'deployment_pending'); assert.equal((await app.stored()).deployment.deploymentId, 'dpl_known');
  assert.equal((await app.deploy()).body.deployment.status, 'deployed');
  assert.equal(app.vercelCalls().filter(call => call.method === 'POST').length, 1); assert.equal(reads, 2);
});
for (const state of ['BUILDING', 'READY']) test(`an audit write failure after confirmed Vercel ${state} cannot relabel it failed or permit duplicate creation`, async t => {
  let fail = true;
  const app = await deploymentWorkflow(t, { vercel: (_call, providers) => providers.json({ id: 'dpl_audited', projectId: 'prj_test', readyState: state, ...(state === 'READY' ? { url: 'devsphere-test.vercel.app' } : {}) }), routes: { updateRun: async (...args) => {
    if (args[2].deployment && fail) { fail = false; throw new Error('Mock transient Firestore write failure'); }
    return updateRun(...args);
  } } });
  assert.equal((await app.deploy()).status, 502);
  assert.equal((await app.stored()).status, state === 'READY' ? 'deployed' : 'deployment_pending');
  await app.deploy(); assert.equal(app.vercelCalls().filter(call => call.method === 'POST').length, 1);
});

test('a Vercel creation response belonging to a different project is unknown, never a successful deployment or a retry grant', async t => {
  const app = await deploymentWorkflow(t, { vercel: (_call, state) => state.json({ id: 'dpl_other_project', projectId: 'prj_other', readyState: 'READY', url: 'other.vercel.app' }) });
  assert.equal((await app.deploy()).status, 502); assert.equal((await app.stored()).status, 'deployment_unknown');
  assert.equal((await app.deploy()).status, 409); assert.equal(app.vercelCalls().filter(call => call.method === 'POST').length, 1);
});
