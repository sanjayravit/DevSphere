import test from 'node:test';
import assert from 'node:assert/strict';
import { createQAExecution } from '../services/qa/executionService.js';
import { commandPolicy, validateSnapshot } from '../services/qa/policy.js';
import { qaAgent } from '../agents/qaAgent.js';
import { evaluateDecision } from '../engines/decisionEngine.js';
const files = [{ path: 'package.json', content: JSON.stringify({ scripts: { build: 'tsc', test: 'vitest' } }) }, { path: 'package-lock.json', content: '{}' }];
const input = { repository: 'o/r', baseSha: 'a'.repeat(40), changes: [{ path: 'a.js', content: 'export const a = 1;' }] };
function fixture(state, options = {}) {
  let cleaned = 0;
  const service = createQAExecution({ snapshot: async () => files, providerFactory: () => ({ execute: async job => ({ id: job.id, inputHash: job.inputHash, state, commands: job.commands.map(c => ({ id: c.id, exitCode: state === 'failed' ? 1 : 0, durationMs: 1, output: 'SECRET' })), ...options.result }), cleanup: async () => { cleaned++; if (options.cleanupFails) throw new Error(); } }), ...options });
  return { service, cleaned: () => cleaned };
}
test('QA command policy rejects shell commands, options, duplicate commands and traversal', () => {
  for (const requested of [['curl'], ['test;curl'], ['--prefix=/'], ['test', 'test'], []]) assert.throws(() => commandPolicy(files, requested));
  for (const path of ['../a.js', '.env', '/etc/passwd', 'x/../../a', 'a\\b', '.git/config', 'x/../package-lock.json']) assert.throws(() => validateSnapshot([{ path, content: 'x' }]));
  assert.throws(() => validateSnapshot([{ path: 'a', content: 'x' }, { path: 'a/b', content: 'x' }]));
  assert.equal(commandPolicy(files, ['install', 'build', 'test']).length, 3);
});
test('static checks do not constitute mandatory QA; missing runner cannot execute in any mode', async () => {
  const qa = await qaAgent(input); assert.equal(qa.status, 'inconclusive'); assert.equal(qa.checks[0].kind, 'static');
  for (const mode of ['manual', 'approval', 'assisted', 'full-auto']) assert.equal(evaluateDecision({ mode, confidence: 99, risk: 'low', qa }).decision, 'suggest');
  assert.equal((await createQAExecution({ providerFactory: () => null })(input)).state, 'runner_unavailable');
});
for (const state of ['passed', 'failed', 'timeout', 'cancelled', 'resource_limit', 'missing_dependencies', 'unsupported', 'incomplete']) test(`sandbox ${state} is explicit and always cleaned`, async () => {
  const f = fixture(state); const result = await f.service(input);
  assert.equal(result.state, state); assert.equal(result.status, ['passed', 'failed'].includes(state) ? state : 'inconclusive'); assert.equal(f.cleaned(), 1);
  assert.ok(!JSON.stringify(result).includes('SECRET'));
});
test('incomplete success, wrong binding and cleanup failure cannot pass', async () => {
  for (const options of [{ result: { commands: [] } }, { result: { inputHash: 'wrong' } }, { cleanupFails: true }]) assert.equal((await fixture('passed', options).service(input)).status, 'inconclusive');
});
test('real cancellation and service timeout invoke cleanup', async () => {
  for (const cancel of [true, false]) {
    let cleaned = false; const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20);
    const service = createQAExecution({ timeoutMs: 5, snapshot: async () => files, providerFactory: () => ({ execute: () => new Promise(() => {}), cleanup: async () => { cleaned = true; } }) });
    if (cancel) controller.abort();
    const keepAlive = setTimeout(() => {}, 50);
    const result = await service(input, { signal: controller.signal }); clearTimeout(timer); clearTimeout(keepAlive);
    assert.equal(result.state, cancel ? 'cancelled' : 'timeout'); assert.ok(cleaned);
  }
});
test('missing scripts and syntax errors fail without running host code', async () => {
  assert.throws(() => commandPolicy([{ path: 'package.json', content: '{}' }], ['test']), e => e.code === 'missing_dependencies');
  assert.equal((await qaAgent({ changes: [{ path: 'bad.ts', content: 'const = ;' }] })).status, 'failed');
});
