import test from 'node:test';
import assert from 'node:assert/strict';
import { mockProviders, baseSha } from './helpers/providers.js';
import { getPullRequestChecks } from '../services/githubService.js';
import { fakeFirestore } from './helpers/firestore.js';
import { configureFirestore, createRun, claimCheckRefresh, recordCheckRefresh, getRun } from '../services/firebaseService.js';
function fixture(t, github) {
  const state = mockProviders(t, { github });
  state.pulls.set(1, { number: 1, merged: false, head: { sha: baseSha, repo: { full_name: 'example/project' } }, base: { ref: 'trunk', repo: { full_name: 'example/project' } } });
  return state;
}
test('actual checks are bound to repository, PR and exact SHA with dynamic default branch', async t => {
  fixture(t); const ci = await getPullRequestChecks('example/project', 1, baseSha);
  assert.equal(ci.state, 'successful'); assert.equal(ci.headSha, baseSha); assert.equal(ci.defaultBranch, 'trunk'); assert.equal(ci.passed, true);
});
for (const [status, conclusion, expected] of [['queued', null, 'queued'], ['in_progress', null, 'in_progress'], ['completed', 'failure', 'failed'], ['completed', 'cancelled', 'cancelled'], ['completed', 'neutral', 'missing']]) test(`CI ${expected} never passes`, async t => {
  fixture(t, (call, s) => call.path.endsWith('/check-runs') ? s.json({ check_runs: [{ id: 1, name: 'validate', head_sha: baseSha, app: { id: 15368 }, status, conclusion }] }) : null);
  const ci = await getPullRequestChecks('example/project', 1, baseSha); assert.equal(ci.state, expected); assert.equal(ci.passed, false);
});
for (const kind of ['missing', 'malformed', 'denied', 'rate-limit', 'wrong-sha', 'rules-denied']) test(`CI ${kind} fails closed`, async t => {
  fixture(t, (call, s) => {
    if (kind === 'rules-denied' && call.path.includes('/rules/')) return s.json({}, 403);
    if (!call.path.endsWith('/check-runs')) return null;
    if (kind === 'missing') return s.json({ check_runs: [] });
    if (kind === 'malformed') return s.json({});
    if (kind === 'denied') return s.json({}, 403);
    if (kind === 'rate-limit') return s.json({}, 429);
    if (kind === 'wrong-sha') return s.json({ check_runs: [{ id: 1, name: 'validate', head_sha: 'f'.repeat(40), status: 'completed', conclusion: 'success' }] });
  });
  const ci = await getPullRequestChecks('example/project', 1, baseSha); assert.equal(ci.passed, false); assert.equal(ci.state, kind === 'missing' ? 'missing' : 'inaccessible');
});
test('changed heads before and during refresh are stale, never reusable success', async t => {
  const f = fixture(t); assert.equal((await getPullRequestChecks('example/project', 1, 'b'.repeat(40))).state, 'stale');
  let reads = 0;
  fixture(t, (call, s) => { if (call.path.endsWith('/pulls/1') && ++reads === 2) return s.json({ ...f.pulls.get(1), head: { sha: 'c'.repeat(40) } }); });
  assert.equal((await getPullRequestChecks('example/project', 1, baseSha)).state, 'stale');
});
test('CI refresh is owner-scoped, transactional, bounded and generation-bound', async () => {
  configureFirestore(fakeFirestore());
  try {
    await createRun('r', { userId: 'u', proposal: { repository: 'o/r' }, pullNumber: 1, commitSha: baseSha, ci: { state: 'successful', passed: true } });
    assert.equal(await claimCheckRefresh('r', 'other'), null);
    const claims = await Promise.all([claimCheckRefresh('r', 'u'), claimCheckRefresh('r', 'u')]);
    assert.equal(claims.filter(Boolean).length, 1); assert.equal((await getRun('r', 'u')).ci.passed, false);
    const ci = { repository: 'o/r', pullNumber: 1, expectedHeadSha: baseSha, state: 'missing', passed: false };
    assert.equal(await recordCheckRefresh('r', 'u', 99, ci), null);
    await assert.rejects(recordCheckRefresh('r', 'u', 1, { ...ci, expectedHeadSha: 'bad' }));
    const recorded = await recordCheckRefresh('r', 'u', 1, ci); assert.equal(recorded.event.runId, 'r');
    assert.equal((await recordCheckRefresh('r', 'u', 1, ci)).event, null);
  } finally { configureFirestore(null); }
});
