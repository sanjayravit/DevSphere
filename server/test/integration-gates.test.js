import test from 'node:test';
import assert from 'node:assert/strict';
import { integrationPreflight, requireLiveConfiguration } from '../../scripts/integration/config.mjs';
test('preflight is configuration-only and every live provider is disabled without staging gates', () => {
  for (const provider of ['all', 'openai', 'firebase', 'github', 'socket', 'vercel', 'unknown']) {
    const result = integrationPreflight({}, provider); assert.equal(result.enabled, false); assert.match(result.mode, /no provider calls/);
    assert.throws(() => requireLiveConfiguration({}, provider));
  }
});
test('staging cannot reuse application targets or enable production deployments', () => {
  const env = { DEVSPHERE_INTEGRATION_ENABLED: 'true', STAGING_CONFIRMATION: 'disposable-resources-only', STAGING_GITHUB_TOKEN: 'fake', STAGING_GITHUB_REPOSITORY: 'o/devsphere-verification-test' };
  assert.equal(integrationPreflight(env, 'github').enabled, true);
  for (const extra of [{ ENABLE_PRODUCTION_DEPLOYMENTS: 'true' }, { GITHUB_REPOSITORY: env.STAGING_GITHUB_REPOSITORY }, { STAGING_GITHUB_REPOSITORY: 'o/production' }]) assert.equal(integrationPreflight({ ...env, ...extra }, 'github').enabled, false);
});
test('remote emulator endpoints and non-staging socket URLs are rejected', () => {
  assert.ok(integrationPreflight({ FIRESTORE_EMULATOR_HOST: 'remote:8080' }, 'firebase').blockers.some(b => b.includes('local Firestore')));
  assert.ok(integrationPreflight({ STAGING_SOCKET_URL: 'https://app.example.com' }, 'socket').blockers.some(b => b.includes('staging HTTPS')));
});
