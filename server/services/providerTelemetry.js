import { AsyncLocalStorage } from 'node:async_hooks';
import { boundedInteger } from '../utils/security.js';
const scopes = new AsyncLocalStorage();
export const withProviderScope = (scope, work) => scopes.run(scope, work);
export async function observedFetch(provider, url, options, retryAttempt) {
  const scope = scopes.getStore();
  if (!scope) return fetch(url, options);
  const started = Date.now(); let status = null; let failure = null;
  try {
    const { consumeProviderQuota } = await import('./firebaseService.js');
    await consumeProviderQuota(scope.userId, provider, boundedInteger(process.env.V2_PROVIDER_REQUESTS_PER_MINUTE, 60, 1, 300));
    const response = await fetch(url, options); status = response.status;
    return response;
  } catch (error) { failure = error.code === 'PROVIDER_QUOTA' ? 'quota' : 'network-or-cancelled'; throw error; }
  finally {
    const sdkRetry = new Headers(options?.headers).get('x-stainless-retry-count');
    const metric = { provider, retryAttempt: retryAttempt ?? (sdkRetry !== null && /^\d+$/.test(sdkRetry) ? Number(sdkRetry) : provider === 'vercel' ? 0 : null), latencyMs: Date.now() - started, status, failure, at: new Date().toISOString() };
    // Instrumentation cannot convert an accepted mutation into permission to retry.
    try { await scope.onMetric?.(metric); } catch { /* provider result remains authoritative */ }
  }
}
export function assertProductionConfiguration(env = process.env) {
  const failures = [];
  if (env.NODE_ENV !== 'production' && !env.VERCEL) return failures;
  if (!env.JWT_SECRET || Buffer.byteLength(env.JWT_SECRET) < 32) failures.push('JWT_SECRET must be a strong 32+ byte secret.');
  if (!env.V2_ALLOWED_USER_IDS?.trim()) failures.push('V2_ALLOWED_USER_IDS must explicitly authorize operators.');
  const origins = (env.CLIENT_ORIGINS || env.CLIENT_URL || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!origins.length || origins.some(origin => { try { const u = new URL(origin); return u.protocol !== 'https:' || u.origin !== origin || origin.includes('*'); } catch { return true; } })) failures.push('CLIENT_ORIGINS/CLIENT_URL must contain exact HTTPS origins.');
  return failures;
}
