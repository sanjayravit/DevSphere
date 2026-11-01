import { createHash, randomUUID } from 'node:crypto';
import { LIMITS, commandPolicy, validateSnapshot } from './policy.js';
import { remoteSandboxProvider } from './remoteProvider.js';
import { getQASnapshot } from '../githubService.js';
import { redact } from '../../utils/security.js';
const states = new Set(['passed', 'failed', 'timeout', 'cancelled', 'resource_limit', 'missing_dependencies', 'unsupported', 'incomplete', 'runner_unavailable']);
export function createQAExecution({ providerFactory = remoteSandboxProvider, snapshot = getQASnapshot, timeoutMs = LIMITS.timeoutMs } = {}) {
  return async (input, { signal } = {}) => {
    const started = Date.now();
    const evidence = { kind: 'sandbox', state: 'runner_unavailable', status: 'inconclusive', commands: [], artifacts: [], limits: LIMITS, durationMs: 0 };
    let provider; const id = randomUUID();
    const deadline = AbortSignal.timeout(timeoutMs);
    const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
    try {
      provider = providerFactory();
      if (!provider) return evidence;
      if (input.changes.some(f => !/\.(js|jsx|mjs|cjs|ts|tsx|json|md|txt)$/i.test(f.path))) { evidence.state = 'unsupported'; return evidence; }
      const source = await snapshot(input.repository, input.baseSha, { signal: combined });
      const files = new Map(validateSnapshot(source).map(f => [f.path, f]));
      for (const file of input.changes) files.set(file.path, { path: file.path, content: file.content });
      const contents = [...files.values()];
      const requested = process.env.QA_COMMANDS ? process.env.QA_COMMANDS.split(',') : ['install', 'build', 'test'];
      const commands = commandPolicy(contents, requested);
      evidence.attempted = commands;
      const inputHash = createHash('sha256').update(JSON.stringify({ files: contents, commands })).digest('hex');
      evidence.inputHash = inputHash;
      const job = { id, inputHash, files: contents, commands, limits: LIMITS };
      // Even an incorrectly implemented provider cannot hang the trusted process.
      const result = await new Promise((resolve, reject) => {
        const abort = () => reject(Object.assign(new Error('Sandbox deadline reached.'), { code: signal?.aborted ? 'cancelled' : 'timeout' }));
        if (combined.aborted) return abort();
        combined.addEventListener('abort', abort, { once: true });
        Promise.resolve().then(() => provider.execute(job, { signal: combined })).then(resolve, reject).finally(() => combined.removeEventListener('abort', abort));
      });
      if (!result || result.id !== id || result.inputHash !== inputHash || !states.has(result.state) || !Array.isArray(result.commands) || result.commands.length > commands.length) throw new Error('Incomplete sandbox evidence.');
      evidence.commands = result.commands.map((entry, i) => {
        if (entry.id !== commands[i].id || !Number.isInteger(entry.exitCode) || !Number.isFinite(entry.durationMs) || entry.durationMs < 0) throw new Error('Invalid command evidence.');
        // Raw tool output can contain arbitrary private information. Do not persist it.
        return { ...commands[i], exitCode: entry.exitCode, durationMs: entry.durationMs, outputSummary: `Exit ${entry.exitCode}; ${Math.min(LIMITS.outputBytes, Math.max(0, Number(entry.outputBytes) || 0))} output bytes captured and discarded.` };
      });
      evidence.state = result.state;
      if (result.state === 'passed' && (evidence.commands.length !== commands.length || evidence.commands.some(c => c.exitCode !== 0))) evidence.state = 'incomplete';
      evidence.status = evidence.state === 'passed' ? 'passed' : evidence.state === 'failed' ? 'failed' : 'inconclusive';
      evidence.resource = ['memory', 'disk', 'process', 'cpu', 'unknown'].includes(result.resource) ? result.resource : null;
    } catch (error) {
      evidence.state = signal?.aborted ? 'cancelled' : deadline.aborted ? 'timeout' : states.has(error.code) ? error.code : 'incomplete';
    } finally {
      if (provider) {
        try { await provider.cleanup(id); evidence.cleanup = 'confirmed'; }
        catch { evidence.cleanup = 'unconfirmed'; evidence.state = 'incomplete'; evidence.status = 'inconclusive'; }
      }
      evidence.durationMs = Date.now() - started;
    }
    return redact(evidence);
  };
}
export const executeQA = createQAExecution();
