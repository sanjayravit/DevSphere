import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeFirestore } from './helpers/firestore.js';
import { passedQA } from './helpers/qa.js';
import { hasMandatoryQA } from '../services/qa/evidence.js';
import { evaluateDecision } from '../engines/decisionEngine.js';
import { configureFirestore, createRun, getRun, releaseRun, consumeProviderQuota, claimRunApproval, claimRunDeployment, requestRunCancellation } from '../services/firebaseService.js';
import { withProviderScope, observedFetch, assertProductionConfiguration } from '../services/providerTelemetry.js';
import { commandPolicy } from '../services/qa/policy.js';
import { proposalHash } from '../utils/security.js';
function store(t) { const db = fakeFirestore(); configureFirestore(db); t.after(() => configureFirestore(null)); return db; }
test('old static QA and incomplete evidence cannot grant execution even at 99% confidence', () => {
  for (const qa of [{ status: 'passed' }, { ...passedQA, execution: { ...passedQA.execution, cleanup: 'unconfirmed' } }, { ...passedQA, execution: { ...passedQA.execution, commands: [] } }]) {
    assert.equal(hasMandatoryQA(qa), false);
    for (const mode of ['approval', 'assisted', 'full-auto']) assert.equal(evaluateDecision({ mode, confidence: 99, risk: 'low', qa }).decision, 'suggest');
  }
  assert.equal(hasMandatoryQA(passedQA), true);
});
test('old persisted static-only approvals and deployment claims are invalidated without migration writes', async t => {
  const db = store(t); const qa = { status: 'passed' }; const proposal = { repository: 'o/r', qa }; const hash = proposalHash(proposal);
  await createRun('old', { userId: 'u', qa, proposal, approvalHash: hash, status: 'pending_approval', approval: 'pending', decision: { decision: 'ask' } });
  assert.equal(await claimRunApproval('old', 'u', hash), null);
  Object.assign(db.records.get('devsphereRuns/old'), { status: 'pull_request', pullNumber: 1, approval: 'approved' });
  assert.equal(await claimRunDeployment('old', 'u'), null);
});
test('install-only and JSON-only validation cannot certify JS source', () => {
  const files = [{ path: 'package.json', content: '{}' }, { path: 'index.js', content: 'export const a = 1;' }];
  assert.throws(() => commandPolicy(files, ['install']), /alone/);
  assert.throws(() => commandPolicy(files, ['json']), /cannot validate/);
});
test('durable request IDs never replay a completed or ambiguous run', async t => {
  store(t); await createRun('first', { userId: 'u', requestId: 'same', status: 'running' }); await releaseRun('first', 'u');
  await assert.rejects(createRun('second', { userId: 'u', requestId: 'same' }), e => e.code === 'DUPLICATE_REQUEST' && e.runId === 'first');
  await createRun('other', { userId: 'other', requestId: 'same' });
});
test('per-user/provider quota claims serialize across instances without leaking to other owners', async t => {
  store(t); const claims = await Promise.allSettled(Array.from({ length: 5 }, () => consumeProviderQuota('u', 'github', 2)));
  assert.equal(claims.filter(c => c.status === 'fulfilled').length, 2);
  assert.ok(claims.filter(c => c.status === 'rejected').every(c => c.reason.code === 'PROVIDER_QUOTA'));
  await consumeProviderQuota('other', 'github', 2); await consumeProviderQuota('u', 'openai', 2);
});
test('telemetry contains only provider, status, latency and retry evidence, and quota stops network calls', async t => {
  store(t); const old = globalThis.fetch; const oldLimit = process.env.V2_PROVIDER_REQUESTS_PER_MINUTE;
  t.after(() => { globalThis.fetch = old; if (oldLimit === undefined) delete process.env.V2_PROVIDER_REQUESTS_PER_MINUTE; else process.env.V2_PROVIDER_REQUESTS_PER_MINUTE = oldLimit; });
  process.env.V2_PROVIDER_REQUESTS_PER_MINUTE = '1'; let calls = 0; const metrics = [];
  globalThis.fetch = async () => { calls++; return new Response('{}'); };
  await withProviderScope({ userId: 'u', onMetric: m => metrics.push(m) }, async () => {
    await observedFetch('github', 'https://api.github.com/private', { headers: { Authorization: 'private-token' } }, 0);
    await assert.rejects(observedFetch('github', 'https://api.github.com/private', {}), e => e.code === 'PROVIDER_QUOTA');
  });
  assert.equal(calls, 1); assert.equal(metrics[0].retryAttempt, 0); assert.equal(metrics[1].failure, 'quota');
  assert.ok(!JSON.stringify(metrics).includes('private')); assert.ok(metrics.every(m => m.latencyMs >= 0));
});
test('cancellation is durable, owner-scoped and cannot undo completed work', async t => {
  store(t); await createRun('active', { userId: 'u', status: 'running' });
  assert.equal(await requestRunCancellation('active', 'other'), null);
  assert.equal((await requestRunCancellation('active', 'u')).cancelRequested, true);
  await requestRunCancellation('active', 'u'); assert.equal((await getRun('active', 'u')).events.length, 1);
  await createRun('done', { userId: 'v', status: 'pull_request' }); assert.equal(await requestRunCancellation('done', 'v'), null);
});
test('recorded CI success expires and is not a perpetual deployment grant', async t => {
  store(t); await createRun('ci', { userId: 'u', ci: { state: 'successful', passed: true, checkedAt: '2020-01-01T00:00:00Z' } });
  assert.equal((await getRun('ci', 'u')).ci.state, 'stale'); assert.equal((await getRun('ci', 'u')).ci.passed, false);
});
test('non-mutating production configuration audit checks HTTPS, JWT strength and operator allowlist', () => {
  assert.equal(assertProductionConfiguration({ NODE_ENV: 'production' }).length, 3);
  assert.deepEqual(assertProductionConfiguration({ NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(48), CLIENT_ORIGINS: 'https://app.example.com', V2_ALLOWED_USER_IDS: 'u' }), []);
  assert.ok(assertProductionConfiguration({ NODE_ENV: 'production', CLIENT_ORIGINS: 'https://*.example.com' }).some(f => f.includes('HTTPS')));
});
