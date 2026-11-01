import { LIMITS } from './policy.js';
// SandboxProvider interface: execute(job, {signal}), cleanup(jobId). Only the
// isolated runner receives source; never pass process.env, tokens or repo URLs.
export function remoteSandboxProvider(env = process.env) {
  if (env.QA_EXECUTION_ENABLED !== 'true' || !env.QA_RUNNER_URL || !env.QA_RUNNER_TOKEN) return null;
  const url = new URL(env.QA_RUNNER_URL);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('QA runner requires a private HTTPS endpoint.');
  const base = url.href.replace(/\/$/, '');
  async function call(path, options) {
    const response = await fetch(`${base}${path}`, { ...options, redirect: 'error', headers: { Authorization: `Bearer ${env.QA_RUNNER_TOKEN}`, 'Content-Type': 'application/json' } });
    if (!response.ok) throw Object.assign(new Error('Sandbox unavailable.'), { code: 'runner_unavailable' });
    const reader = response.body.getReader(); let text = ''; let size = 0;
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 65_536) { await reader.cancel(); throw new Error('Oversized sandbox evidence.'); }
      text += Buffer.from(value).toString('utf8');
    }
    return JSON.parse(text);
  }
  return {
    name: 'remote-rootless-gvisor-v1',
    execute: (job, { signal }) => call(`/jobs/${job.id}`, { method: 'POST', body: JSON.stringify(job), signal }),
    cleanup: async id => {
      const result = await call(`/jobs/${id}`, { method: 'DELETE', signal: AbortSignal.timeout(5000) });
      if (result.cleaned !== true) throw new Error('Sandbox cleanup unconfirmed.');
    },
    limits: LIMITS
  };
}
