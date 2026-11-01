import { passedQA } from './helpers/qa.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateDecision } from '../engines/decisionEngine.js';
import { qaAgent } from '../agents/qaAgent.js';
import { createRunDevSphere, proposalHash } from '../engines/orchestrator.js';
import { validateRepositoryPath, getDefaultBranch, createBranch, commitChanges } from '../services/githubService.js';
import { configureFirestore, claimRunApproval, createRun, getRun } from '../services/firebaseService.js';
import auth from '../middleware/auth.js';
import { signSession } from '../config/session.js';
import { fakeFirestore } from './helpers/firestore.js';
import { mockProviders, baseSha, blobSha } from './helpers/providers.js';

const passed = passedQA;
const repositoryInfo = { default_branch: 'trunk', full_name: 'example/project', html_url: 'https://github.com/example/project' };
const restoreEnvironment = (t, oldFetch, oldRepo, oldToken) => t.after(() => {
  globalThis.fetch = oldFetch;
  if (oldRepo === undefined) delete process.env.GITHUB_REPOSITORY; else process.env.GITHUB_REPOSITORY = oldRepo;
  if (oldToken === undefined) delete process.env.GITHUB_TOKEN; else process.env.GITHUB_TOKEN = oldToken;
});

test('decision policy enforces modes, QA, risk and confidence gates', () => {
  const decide = (mode, confidence, risk = 'low', qa = passed) => evaluateDecision({ mode, confidence, risk, impact: 'file', qa }).decision;
  assert.equal(decide('manual', 99), 'suggest');
  assert.equal(decide('approval', 99), 'ask');
  assert.equal(decide('assisted', 81), 'auto');
  assert.equal(decide('assisted', 80), 'suggest');
  assert.equal(decide('assisted', 99, 'medium'), 'ask');
  assert.equal(decide('full-auto', 70), 'auto');
  assert.equal(decide('full-auto', 69), 'suggest');
  assert.equal(decide('full-auto', 99, 'medium'), 'ask');
  assert.equal(decide('full-auto', 39, 'high'), 'block');
  assert.equal(decide('approval', 99, 'low', { status: 'failed' }), 'block');
  assert.equal(decide('approval', 99, 'low', { status: 'inconclusive' }), 'suggest');
  assert.throws(() => evaluateDecision({ confidence: 101, risk: 'low', impact: 'file', mode: 'manual', qa: passed }), /confidence/);
  assert.throws(() => evaluateDecision({ confidence: 80, risk: 'critical', impact: 'file', mode: 'manual', qa: passed }), /risk/);
});

test('repository path validation blocks traversal, credentials and secrets', () => {
  for (const path of ['../secret.js', '/etc/passwd', 'src\\..\\secret.js', '.env', 'config/.env.production', 'keys/private.pem', 'serviceAccount.json', 'package-lock.json', '.git/config']) assert.throws(() => validateRepositoryPath(path), undefined, path);
  assert.equal(validateRepositoryPath('src/features/widget.js'), 'src/features/widget.js');
});

test('GitHub integration detects the configured repository default branch dynamically', async t => {
  const oldFetch = globalThis.fetch; const oldRepo = process.env.GITHUB_REPOSITORY; const oldToken = process.env.GITHUB_TOKEN;
  process.env.GITHUB_REPOSITORY = 'example/project'; process.env.GITHUB_TOKEN = 'test-token';
  globalThis.fetch = async () => new Response(JSON.stringify(repositoryInfo), { status: 200 });
  restoreEnvironment(t, oldFetch, oldRepo, oldToken);
  assert.equal(await getDefaultBranch(), 'trunk');
});

test('GitHub branch and Contents APIs create and update files with Base64 and blob SHA', async t => {
  const fixture = mockProviders(t, { files: { 'src/existing.js': 'old' } });
  const branch = await createBranch(undefined, 'devsphere/test');
  assert.equal(branch.base, 'trunk'); assert.equal(branch.baseSha, baseSha);
  const changes = [
    { path: 'src/new.js', operation: 'create', content: 'export const x = "é";', expectedSha: null },
    { path: 'src/existing.js', operation: 'update', content: 'export const old = false;', expectedSha: blobSha('old') }
  ];
  const commit = await commitChanges(undefined, 'devsphere/test', changes);
  const puts = fixture.calls.filter(call => call.method === 'PUT');
  assert.equal(puts.length, 2);
  assert.equal(Buffer.from(puts[0].body.content, 'base64').toString('utf8'), changes[0].content);
  assert.equal(puts[0].body.sha, undefined);
  assert.equal(puts[1].body.sha, blobSha('old'));
  assert.equal(commit.commitSha, fixture.branches.get('devsphere/test'));
  assert.equal(fixture.branches.get('trunk'), baseSha);
});

test('GitHub updates fail closed when the proposed blob SHA is stale', async t => {
  const fixture = mockProviders(t, { files: { 'src/changed.js': 'newer' } });
  fixture.branches.set('devsphere/test', baseSha);
  await assert.rejects(commitChanges(undefined, 'devsphere/test', [{ path: 'src/changed.js', operation: 'update', content: 'new content', expectedSha: 'stale-blob-sha' }]), error => error.code === 'GITHUB_CONFLICT');
  assert.equal(fixture.calls.some(call => call.method === 'PUT'), false);
});

test('QA reports malformed JSON and JavaScript syntax as failures', async () => {
  const result = await qaAgent({ changes: [{ path: 'config.json', content: '{broken' }, { path: 'src/bad.js', content: 'export const = ;' }] });
  assert.equal(result.status, 'failed'); assert.equal(result.checks.length, 2);
  assert.ok(result.checks.every(check => check.status === 'failed'));
  assert.deepEqual(result.executedTests, []);
});

test('authentication middleware rejects missing tokens and accepts valid identities', async () => {
  const invoke = authorization => new Promise(resolve => {
    const req = { header: () => authorization };
    const res = { status(code) { this.statusCode = code; return this; }, json(body) { resolve({ status: this.statusCode, body }); } };
    auth(req, res, () => resolve({ user: req.user }));
  });
  assert.equal((await invoke(undefined)).status, 401);
  const token = signSession('person-1');
  assert.deepEqual(await invoke(`Bearer ${token}`), { user: { id: 'person-1' } });
});

test('Firestore approval claim is owner-scoped, exact-hash-bound, and single-use', async () => {
  const store = fakeFirestore(); configureFirestore(store);
  try {
    const changes = [{ path: 'src/a.js', operation: 'create', content: 'export const a = 1;', expectedSha: null }];
    const proposal = { changes, repository: 'example/project', baseSha, qa: passedQA };
    const hash = proposalHash(proposal);
    assert.equal(proposalHash(changes), proposalHash([{ expectedSha: null, content: 'export const a = 1;', operation: 'create', path: 'src/a.js' }]));
    await createRun('run-1', { userId: 'user-a', status: 'pending_approval', approval: 'pending', approvalHash: hash, proposal, qa: passedQA, decision: { decision: 'ask' } });
    assert.equal(await claimRunApproval('run-1', 'user-b', hash), null);
    assert.equal(await claimRunApproval('run-1', 'user-a', '0'.repeat(64)), null);
    const claimed = await claimRunApproval('run-1', 'user-a', hash);
    assert.equal(claimed.status, 'executing'); assert.equal(claimed.approval, 'approved');
    assert.equal(await claimRunApproval('run-1', 'user-a', hash), null);
    assert.equal(await getRun('run-1', 'user-b'), null);
  } finally { configureFirestore(null); }
});

test('orchestrator persists a failed attempt and emits error progress without executing', async () => {
  const stored = []; const emitted = []; const created = [];
  const run = createRunDevSphere({
    createRun: async (id, data) => created.push({ id, ...data }),
    appendRunEvent: async (id, userId, event) => { stored.push({ id, userId, ...event }); return event; },
    updateRun: async (id, userId, patch) => stored.push({ id, userId, patch }),
    processIntent: async () => { throw new Error('simulated model timeout'); }
  });
  await assert.rejects(run({ input: 'Implement a safe change request', mode: 'assisted', userId: 'u-1', emit: event => emitted.push(event) }), /simulated model timeout/);
  assert.equal(created.length, 1);
  assert.ok(stored.some(entry => entry.patch?.status === 'failed'));
  assert.ok(emitted.some(event => event.step === 'orchestrator' && event.status === 'failed'));
});

test('orchestrator blocks failed QA and makes no GitHub mutations', async () => {
  const updates = []; const calls = [];
  const run = createRunDevSphere({
    createRun: async () => {}, appendRunEvent: async () => {}, updateRun: async (_id, _userId, patch) => updates.push(patch),
    processIntent: async input => ({ summary: input, steps: ['change'], acceptanceCriteria: [] }),
    plannerAgent: async () => ({ tasks: ['change'], priority: 'normal', risk: 'low', impact: 'file', confidence: 99, issue: 'A defect', suggestedFix: 'Patch the defect' }),
    devAgent: async () => ({ changes: [{ path: 'src/a.js', operation: 'create', content: 'x', expectedSha: null }], repository: 'o/r', defaultBranch: 'trunk' }),
    qaAgent: async () => ({ status: 'failed', checks: [{ status: 'failed' }], executedTests: [], summary: 'syntax failure' }),
    createUniqueBranch: async () => { calls.push('branch'); throw new Error('must not run'); }
  });
  const result = await run({ input: 'Implement a meaningful safe update', mode: 'full-auto', userId: 'u-2' });
  assert.equal(result.status, 'blocked'); assert.equal(result.decision.decision, 'block');
  assert.deepEqual(calls, []); assert.ok(updates.some(patch => patch.status === 'blocked'));
});
