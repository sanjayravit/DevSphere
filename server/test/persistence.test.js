import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { fakeFirestore } from './helpers/firestore.js';
import { configureFirestore, createRun, releaseRun, getRun, listRuns, updateRun, appendRunEvent, claimRunApproval, rejectRunApproval } from '../services/firebaseService.js';
import { proposalHash, redact } from '../utils/security.js';

function store(t) { const database = fakeFirestore(); configureFirestore(database); t.after(() => configureFirestore(null)); return database; }
test('Firestore writes and updates remain owner-scoped and proposals become immutable once stored', async t => {
  store(t);
  await createRun('r-1', { userId: 'owner', status: 'running', proposal: null });
  assert.equal(await updateRun('r-1', 'other', { input: 'takeover' }), null);
  assert.equal(await getRun('r-1', 'other'), null);
  await assert.rejects(updateRun('r-1', 'owner', { userId: 'other' }), /identity/);
  const proposal = { changes: [{ path: 'x.js', operation: 'create', content: 'const token = "small";', expectedSha: null }], repository: 'o/r' };
  await updateRun('r-1', 'owner', { proposal, approvalHash: proposalHash(proposal) });
  const record = await getRun('r-1', 'owner');
  assert.equal(record.proposal.changes[0].content, proposal.changes[0].content);
  assert.equal(record.approvalHash, proposalHash(record.proposal));
  await assert.rejects(updateRun('r-1', 'owner', { proposal: { ...proposal, repository: 'other/repo' } }), /immutable/);
  assert.equal(await updateRun('r-1', 'owner', { status: 'failed' }, { expectedStatus: 'executing' }), null);
});
test('run creation enforces cross-instance active-run and per-minute quotas transactionally', async t => {
  const database = store(t);
  const attempts = await Promise.allSettled(['one', 'two'].map(id => createRun(id, { userId: 'owner', status: 'running' })));
  assert.equal(attempts.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal(attempts.find(item => item.status === 'rejected').reason.status, 429);
  const active = database.records.get('devsphereRunLocks/owner').runId;
  await releaseRun(active, 'other');
  assert.equal(database.records.get('devsphereRunLocks/owner').runId, active);
  await releaseRun(active, 'owner');
  for (let index = 2; index <= 5; index++) { await createRun(`run-${index}`, { userId: 'owner', status: 'running' }); await releaseRun(`run-${index}`, 'owner'); }
  await assert.rejects(createRun('sixth', { userId: 'owner', status: 'running' }), error => error.status === 429);
  assert.equal(database.records.has('devsphereRuns/sixth'), false);
});
test('history retrieves the newest runs even after more than one hundred records and excludes another owner', async t => {
  const database = store(t);
  for (let index = 0; index < 140; index++) await database.collection('devsphereRuns').doc(`run-${index}`).create({ userId: 'owner', createdAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString(), proposal: { changes: ['heavy data'] } });
  await database.collection('devsphereRuns').doc('other').create({ userId: 'another-user', createdAt: '2099-01-01' });
  const runs = await listRuns('owner', 5);
  assert.equal(runs.length, 5); assert.equal(runs[0].id, 'run-139'); assert.equal(runs[4].id, 'run-135'); assert.equal(runs[0].proposal, undefined);
});
test('concurrent execution/error events retain order, redact secrets and bound document growth', async t => {
  store(t);
  await createRun('events', { userId: 'owner', status: 'running' });
  await Promise.all(Array.from({ length: 105 }, (_, index) => appendRunEvent('events', 'owner', { step: 'qa', status: 'running', detail: { index } })));
  const run = await getRun('events', 'owner');
  assert.equal(run.events.length, 100); assert.equal(run.events[0].detail.index, 5); assert.equal(run.events.at(-1).detail.index, 104);
  await assert.rejects(appendRunEvent('events', 'other', { step: 'bad' }), /not found/);
  const event = await appendRunEvent('events', 'owner', { step: 'orchestrator', status: 'failed', detail: { message: `Bearer ${'x'.repeat(32)}` } });
  assert.doesNotMatch(event.detail.message, /x{32}/);
  assert.equal(redact({ totalTokens: 123, accessToken: 'private' }).totalTokens, 123);
  assert.equal(redact({ accessToken: 'private' }).accessToken, undefined);
});
test('approval claims reject stale QA, stale metadata, hash changes and rejections without any execution grant', async t => {
  const database = store(t);
  const proposal = { changes: [], repository: 'o/r', qa: { status: 'passed' } };
  const hash = proposalHash(proposal);
  await createRun('approval', { userId: 'owner', status: 'pending_approval', approval: 'pending', approvalHash: hash, proposal, qa: { status: 'failed' }, decision: { decision: 'ask' } });
  assert.equal(await claimRunApproval('approval', 'owner', hash), null);
  const record = database.records.get('devsphereRuns/approval');
  record.qa.status = 'passed'; record.proposal.repository = 'other/repo';
  assert.equal(await claimRunApproval('approval', 'owner', hash), null);
  record.proposal.repository = 'o/r';
  assert.equal(await rejectRunApproval('approval', 'another-user', hash), null);
  assert.equal((await rejectRunApproval('approval', 'owner', hash)).status, 'rejected');
  assert.equal(await claimRunApproval('approval', 'owner', hash), null);
});

test('Firebase modular SDK initializes a single real Admin app shared by all existing ESM adapters without contacting providers', () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import { createRequire } from 'node:module';
    // Resolve the actual backend SDK, even when both root/server have clean installs.
    const { getApps } = createRequire(new URL('./server/config/firebase.js', import.meta.url))('firebase-admin/app');
    const first = await import('./server/config/firebase.js');
    const second = await import('./server/firebaseAdmin.js');
    const third = await import('./api/firebaseAdmin.js');
    if (getApps().length !== 1 || first.admin.apps.length !== 1 || !first.db || first.db !== second.db || second.db !== third.db) process.exit(1);
    console.log('Admin singleton verified; no network operations performed.');
  `], { cwd: process.cwd(), encoding: 'utf8', env: { ...process.env, FIREBASE_PROJECT_ID: 'devsphere-test-only', FIREBASE_CLIENT_EMAIL: 'test-only@devsphere-test-only.iam.gserviceaccount.com', FIREBASE_PRIVATE_KEY: privateKey.replace(/\n/g, '\\n') }, timeout: 15_000 });
  assert.equal(child.status, 0, child.stderr); assert.match(child.stdout, /singleton verified/);
});
test('invalid partial Firebase configuration fails unavailable rather than crashing the Express app or reporting success', () => {
  const env = { ...process.env, FIREBASE_PROJECT_ID: 'test-only', FIREBASE_CLIENT_EMAIL: 'bad', FIREBASE_PRIVATE_KEY: '', VERCEL: '1' };
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', "const {db}=await import('./server/config/firebase.js'); const {default:app}=await import('./api/index.js'); if(db!==null || typeof app!=='function') process.exit(1);"], { cwd: process.cwd(), env, encoding: 'utf8', timeout: 15_000 });
  assert.equal(child.status, 0, child.stderr);
  assert.match(child.stderr, /initialization failed/);
});

test('an approval policy validation failure after a successful claim is audited as failed rather than stranding an executing run', async t => {
  store(t);
  const { createExecuteApprovedRun } = await import('../engines/orchestrator.js');
  const proposal = { changes: [{ path: 'x.js', operation: 'create', content: 'export const x = 1;', expectedSha: null }], mode: 'approval', confidence: 95, risk: 'low', impact: 'file', qa: { status: 'passed' }, decision: { decision: 'ask' }, repository: 'example/project', baseSha: 'a'.repeat(40) };
  const hash = proposalHash(proposal);
  await createRun('claimed-failure', { userId: 'owner', status: 'pending_approval', approval: 'pending', proposal, approvalHash: hash, qa: proposal.qa, decision: proposal.decision });
  const run = await claimRunApproval('claimed-failure', 'owner', hash);
  const execute = createExecuteApprovedRun({ evaluateDecision: () => { throw new Error('Server policy changed'); } });
  await assert.rejects(execute({ run, userId: 'owner' }), /Server policy changed/);
  const stored = await getRun(run.id, 'owner'); assert.equal(stored.status, 'failed'); assert.equal(stored.approval, 'approved'); assert.match(stored.error, /policy changed/); assert.ok(stored.events.some(event => event.status === 'failed'));
});

test('different pending approvals for one owner share the same durable execution lease; another run cannot start until execution releases it', async t => {
  store(t);
  const proposal = { changes: [], qa: { status: 'passed' } }; const hash = proposalHash(proposal);
  for (const id of ['first', 'second']) {
    await createRun(id, { userId: 'owner', status: 'pending_approval', approval: 'pending', proposal, approvalHash: hash, qa: proposal.qa, decision: { decision: 'ask' } }); await releaseRun(id, 'owner');
  }
  const claims = await Promise.all(['first', 'second'].map(id => claimRunApproval(id, 'owner', hash)));
  assert.equal(claims.filter(Boolean).length, 1);
  await assert.rejects(createRun('third', { userId: 'owner', status: 'running' }), error => error.status === 429);
  await releaseRun(claims.find(Boolean).id, 'owner');
  const remaining = claims[0] ? 'second' : 'first'; assert.ok(await claimRunApproval(remaining, 'owner', hash));
});
