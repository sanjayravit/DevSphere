import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { integrationPreflight, requireLiveConfiguration } from './config.mjs';
// Configuration validation precedes all provider imports, credentials and calls.
const provider = process.argv.find(a => a.startsWith('--provider='))?.split('=')[1] || 'all';
const live = process.argv.includes('--live');
const preflight = integrationPreflight(process.env, provider);
if (!live) { console.log(JSON.stringify(preflight, null, 2)); process.exit(0); }
requireLiveConfiguration(process.env, provider);
const runId = `devsphere-verification-${Date.now()}-${randomUUID().slice(0, 8)}`;
const report = { runId, evidence: 'live-provider (or explicitly labelled emulator)', startedAt: new Date().toISOString(), resources: [], checks: [], productionDeployment: 'disabled' };
const directory = `verification-reports/${runId}`;
await mkdir(directory, { recursive: true, mode: 0o700 });
const save = () => writeFile(`${directory}/report.json`, JSON.stringify(report, null, 2), { mode: 0o600 });
const signal = () => AbortSignal.timeout(60_000);
async function check(name, work) {
  const started = Date.now();
  try { const detail = await work(); report.checks.push({ name, status: 'passed', durationMs: Date.now() - started, detail }); }
  catch (error) { report.checks.push({ name, status: error.ambiguous ? 'unknown' : 'failed', durationMs: Date.now() - started, code: error.code || 'VERIFICATION_FAILED', message: 'Inspect the staging provider by recorded resource IDs. No automatic mutation retry.', ambiguous: Boolean(error.ambiguous) }); process.exitCode = 1; }
  await save();
}
const selected = preflight.selected;
// Never inherit application provider configuration in this verification process.
for (const key of ['FIREBASE_PRIVATE_KEY', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PROJECT_ID', 'GOOGLE_APPLICATION_CREDENTIALS', 'GITHUB_TOKEN', 'OPENAI_API_KEY', 'VERCEL_API_TOKEN', 'VERCEL_PROJECT_ID', 'VERCEL_TEAM_ID']) delete process.env[key];
process.env.ENABLE_PRODUCTION_DEPLOYMENTS = 'false';
process.env.GITHUB_TOKEN = process.env.STAGING_GITHUB_TOKEN || '';
process.env.GITHUB_REPOSITORY = process.env.STAGING_GITHUB_REPOSITORY || '';
process.env.GITHUB_MAX_RETRIES = '0'; process.env.OPENAI_MAX_RETRIES = '0';
if (selected.includes('openai')) await check('OpenAI actual Responses schemas, model and token usage', async () => {
  process.env.OPENAI_API_KEY = process.env.STAGING_OPENAI_API_KEY;
  process.env.OPENAI_MODEL = process.env.STAGING_OPENAI_MODEL;
  const { generateIntent, generatePlan } = await import('../../server/services/aiService.js');
  const usage = [];
  const intent = await generateIntent('Plan adding a pure addition function and unit tests to a disposable JavaScript repository. Do not execute changes.', { signal: signal(), onUsage: item => usage.push(item) });
  const plan = await generatePlan(intent, { signal: signal(), onUsage: item => usage.push(item) });
  assert.ok(intent.summary && plan.tasks.length && usage.length === 2);
  assert.ok(usage.every(u => u.totalTokens > 0));
  // Safe actual negative provider request: inaccessible/nonexistent model; no load storm.
  process.env.OPENAI_MODEL = `devsphere-nonexistent-${runId}`;
  await assert.rejects(generateIntent('Validate a disposable test request.', { signal: signal() }), e => e.code === 'OPENAI_ERROR');
  process.env.OPENAI_MODEL = process.env.STAGING_OPENAI_MODEL;
  return { usage, negative: 'invalid model rejected', rateLimitAndTimeout: 'deterministic unit tests; not live fault-injected' };
});
if (selected.includes('firebase')) await check('Firestore durable history, ownership, approvals and run leases', async () => {
  const { initializeApp, applicationDefault, deleteApp } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  process.env.FIREBASE_PROJECT_ID = process.env.STAGING_FIREBASE_PROJECT_ID;
  if (!process.env.FIRESTORE_EMULATOR_HOST) process.env.GOOGLE_APPLICATION_CREDENTIALS = process.env.STAGING_GOOGLE_APPLICATION_CREDENTIALS;
  const app = initializeApp({ projectId: process.env.STAGING_FIREBASE_PROJECT_ID, ...(process.env.FIRESTORE_EMULATOR_HOST ? {} : { credential: applicationDefault() }) }, runId);
  const db = getFirestore(app);
  const service = await import('../../server/services/firebaseService.js'); service.configureFirestore(db);
  const { proposalHash } = await import('../../server/utils/security.js');
  const owner = `${runId}-owner`;
  report.resources.push({ provider: 'firebase', project: process.env.STAGING_FIREBASE_PROJECT_ID, collection: 'devsphereRuns', id: runId, lockId: owner }); await save();
  try {
    // Synthetic transaction fixture, never passed to an executor or a provider.
    const proposal = { repository: 'fixture/transaction-only', changes: [], qa: { status: 'passed' } };
    const hash = proposalHash(proposal);
    await service.createRun(runId, { userId: owner, status: 'pending_approval', approval: 'pending', proposal, approvalHash: hash, qa: { status: 'passed' }, decision: { decision: 'ask' } });
    await assert.rejects(service.createRun(`${runId}-duplicate`, { userId: owner }));
    await service.appendRunEvent(runId, owner, { step: 'one', status: 'completed' });
    await service.appendRunEvent(runId, owner, { step: 'two', status: 'completed' });
    assert.equal(await service.getRun(runId, `${owner}-other`), null);
    const stored = await service.getRun(runId, owner); assert.deepEqual(stored.events.map(e => e.step), ['one', 'two']);
    assert.ok((await service.listRuns(owner)).some(r => r.id === runId));
    assert.equal(await service.claimRunApproval(runId, `${owner}-other`, hash), null);
    const claims = await Promise.all([service.claimRunApproval(runId, owner, hash), service.claimRunApproval(runId, owner, hash)]);
    assert.equal(claims.filter(Boolean).length, 1);
    await service.releaseRun(runId, owner);
    assert.equal((await db.collection('devsphereRunLocks').doc(owner).get()).data().runId, null);
    return { mode: process.env.FIRESTORE_EMULATOR_HOST ? 'real local emulator, not hosted Firebase' : 'live staging Firestore', authorization: 'API ownership/transaction logic; Admin bypasses client rules', approval: 'synthetic fixture; no execution' };
  } finally { service.configureFirestore(null); await db.terminate(); await deleteApp(app); }
});
let delivery;
if (selected.includes('github')) await check('GitHub repository identity, branch, Base64 create/update, conflict, PR and CI', async () => {
  const github = await import('../../server/services/githubService.js');
  const repo = process.env.STAGING_GITHUB_REPOSITORY;
  const info = await github.getRepositoryInfo(repo, { signal: signal() });
  const base = await github.getBranchHead(repo, info.defaultBranch, { signal: signal() });
  const branch = `devsphere-verification/${runId}`;
  report.resources.push({ provider: 'github', repository: repo, branch, base: info.defaultBranch }); await save();
  await github.createBranch(repo, branch, info.defaultBranch, base, { signal: signal() });
  const path = `verification/${runId}.json`; const content = JSON.stringify({ runId, stage: 1 });
  const created = await github.commitChanges(repo, branch, [{ path, operation: 'create', content, expectedSha: null }], `Verification ${runId}`, { expectedHeadSha: base, signal: signal() });
  const { createHash } = await import('node:crypto');
  const blob = createHash('sha1').update(`blob ${Buffer.byteLength(content)}\0`).update(content).digest('hex');
  const updated = await github.commitChanges(repo, branch, [{ path, operation: 'update', content: JSON.stringify({ runId, stage: 2 }), expectedSha: blob }], `Verification update ${runId}`, { expectedHeadSha: created.commitSha, signal: signal() });
  await assert.rejects(github.commitChanges(repo, branch, [{ path, operation: 'update', content: '{}', expectedSha: blob }], 'Stale write must not execute', { expectedHeadSha: created.commitSha, signal: signal() }), e => e.code === 'GITHUB_CONFLICT');
  const pr = await github.createPullRequest(repo, branch, info.defaultBranch, { title: `[verification] ${runId}`, body: 'Disposable integration verification. Do not merge. Close after evidence review.', expectedHeadSha: updated.commitSha, expectedBaseSha: base, signal: signal() });
  report.resources.push({ provider: 'github', repository: repo, pullNumber: pr.number, url: pr.url, commitSha: updated.commitSha }); await save();
  const ci = await github.getPullRequestChecks(repo, pr.number, updated.commitSha, { signal: signal() });
  assert.notEqual(ci.state, 'inaccessible');
  delivery = { branch, sha: updated.commitSha, info };
  return { repository: info.fullName, defaultBranch: info.defaultBranch, pullNumber: pr.number, ci, note: 'CI retrieval verified; pending/missing CI is not CI success.' };
});
if (selected.includes('socket')) await check('Staging sockets: authentication, reconnect, expiry and persisted owner-only progress', async () => {
  const { io } = await import('socket.io-client'); const { default: jwt } = await import('jsonwebtoken');
  const owner = process.env.STAGING_SOCKET_OWNER; const other = process.env.STAGING_SOCKET_OTHER;
  const sign = (id, expiresIn = '5m') => jwt.sign({ user: { id } }, process.env.STAGING_JWT_SECRET, { algorithm: 'HS256', expiresIn });
  const wait = (socket, event) => new Promise((resolve, reject) => { const timer = setTimeout(() => { socket.off(event, done); reject(new Error('Socket timeout')); }, 10_000); const done = value => { clearTimeout(timer); resolve(value); }; socket.once(event, done); });
  const sockets = []; const connect = token => { const s = io(process.env.STAGING_SOCKET_URL, { auth: { token }, autoConnect: false, reconnection: false, transports: ['websocket'] }); sockets.push(s); return s; };
  try {
    const bad = connect('invalid'); const denied = wait(bad, 'connect_error'); bad.connect(); await denied;
    const a = connect(sign(owner)); const b = connect(sign(other));
    const ready = [wait(a, 'connect'), wait(b, 'connect')]; a.connect(); b.connect(); await Promise.all(ready);
    const observed = []; const leaked = []; a.on('devsphere:update', e => observed.push(e)); b.on('devsphere:update', e => leaked.push(e));
    a.disconnect(); const reconnect = wait(a, 'connect'); a.connect(); await reconnect;
    const request = async (path, user, body) => {
      const response = await fetch(`${process.env.STAGING_API_URL.replace(/\/$/, '')}/api/v2${path}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${sign(user)}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(240_000) });
      return { status: response.status, body: await response.json() };
    };
    const result = await request('/run', owner, { input: `Suggest a small documentation improvement only. Verification ${runId}.`, mode: 'manual', requestId: runId });
    assert.equal(result.status, 200); const id = result.body.runId;
    report.resources.push({ provider: 'socket', runId: id, owner }); await save();
    const stored = await request(`/runs/${id}`, owner); assert.equal(stored.status, 200);
    assert.ok(observed.some(e => e.runId === id)); assert.equal(leaked.some(e => e.runId === id), false);
    assert.ok(stored.body.run.events.some(e => e.runId === id));
    assert.equal((await request(`/runs/${id}`, other)).status, 404);
    const short = connect(sign(owner, '2s')); const connected = wait(short, 'connect'); short.connect(); await connected; await wait(short, 'disconnect');
    return { runId: id, reconnect: 'verified', expiry: 'verified', crossUserLeak: false };
  } finally { sockets.forEach(s => s.disconnect()); }
});
if (selected.includes('vercel')) await check('Vercel preview creation, ID reuse and actual provider status', async () => {
  const github = await import('../../server/services/githubService.js');
  const info = delivery?.info || await github.getRepositoryInfo(process.env.STAGING_GITHUB_REPOSITORY, { signal: signal() });
  const branch = delivery?.branch || process.env.STAGING_PREVIEW_REF;
  assert.match(branch || '', /^devsphere-verification\/[A-Za-z0-9_-]+$/); assert.notEqual(branch, info.defaultBranch);
  const sha = delivery?.sha || await github.getBranchHead(info.fullName, branch, { signal: signal() });
  process.env.VERCEL_API_TOKEN = process.env.STAGING_VERCEL_TOKEN; process.env.VERCEL_PROJECT_ID = process.env.STAGING_VERCEL_PROJECT_ID;
  if (process.env.STAGING_VERCEL_TEAM_ID) process.env.VERCEL_TEAM_ID = process.env.STAGING_VERCEL_TEAM_ID;
  const { vercelRequest, getDeploymentOutcome } = await import('../../server/services/vercelService.js');
  const project = await vercelRequest(`/v9/projects/${encodeURIComponent(process.env.STAGING_VERCEL_PROJECT_ID)}`, { signal: signal() });
  assert.equal(project.id, process.env.STAGING_VERCEL_PROJECT_ID); assert.equal(project.name, process.env.STAGING_VERCEL_PROJECT_NAME); assert.equal(String(project.link?.repoId), String(info.id));
  report.resources.push({ provider: 'vercel', projectId: project.id, branch, sha, mutation: 'preview-only', marker: runId }); await save();
  // target omitted intentionally: never production, even if application flag changes.
  const deployment = await vercelRequest('/v13/deployments', { method: 'POST', signal: signal(), body: { name: project.name, project: project.id, meta: { devsphereVerification: runId }, gitSource: { type: 'github', repoId: String(info.id), ref: branch, sha } } });
  assert.equal(deployment.projectId, project.id); assert.notEqual(deployment.target, 'production'); assert.ok(deployment.id);
  report.resources.push({ provider: 'vercel', projectId: project.id, deploymentId: deployment.id }); await save();
  const states = [];
  for (let i = 0; i < 3; i++) {
    const outcome = await getDeploymentOutcome(deployment.id, {}, { signal: signal() }); states.push(outcome);
    assert.equal(outcome.deploymentId, deployment.id);
    if (outcome.status !== 'pending') break;
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  assert.notEqual(states.at(-1).status, 'failed');
  return { target: 'preview', states, readiness: states.at(-1).status === 'pending' ? 'not certified; poll recorded ID only' : 'READY observed' };
});
report.finishedAt = new Date().toISOString();
report.notPerformed = ['Live rate-limit exhaustion', 'Live ambiguous-write fault injection', 'Production mutations', 'Automatic cleanup/merge', 'Sandbox isolation certification'];
await save(); console.log(`Evidence written to ${directory}/report.json. Inspect recorded resources before cleanup; never retry ambiguous writes.`);
// Firebase's separately initialized default singleton may hold gRPC resources.
process.exit(process.exitCode || 0);
