import { spawnSync } from 'node:child_process';
import { validateRepositoryPath } from '../services/githubService.js';

export async function qaAgent({ changes }) {
  const checks = [];
  let failed = false;
  let inconclusive = false;
  for (const file of changes || []) {
    try { validateRepositoryPath(file.path); } catch (error) { checks.push({ path: file.path, type: 'path-safety', status: 'failed', message: error.message }); failed = true; continue; }
    if (typeof file.content !== 'string' || !file.content.trim()) { checks.push({ path: file.path, type: 'content', status: 'failed', message: 'File content is empty.' }); failed = true; continue; }
    if (/\.(json|jsonc)$/i.test(file.path)) {
      try { JSON.parse(file.content); checks.push({ path: file.path, type: 'json-parse', status: 'passed', message: 'Valid JSON.' }); }
      catch (error) { checks.push({ path: file.path, type: 'json-parse', status: 'failed', message: error.message }); failed = true; }
    } else if (/\.(mjs|cjs|js)$/i.test(file.path)) {
      const result = spawnSync(process.execPath, ['--check', '--input-type=module'], { input: file.content, encoding: 'utf8', timeout: 5_000, maxBuffer: 1_000_000 });
      if (result.error || result.status !== 0) { checks.push({ path: file.path, type: 'javascript-syntax', status: 'failed', message: result.error?.message || result.stderr.trim().slice(0, 500) }); failed = true; }
      else checks.push({ path: file.path, type: 'javascript-syntax', status: 'passed', message: 'Node.js syntax check passed.' });
    } else if (/\.(jsx|tsx)$/i.test(file.path)) {
      checks.push({ path: file.path, type: 'source-review', status: 'inconclusive', message: 'JSX/TSX requires the repository build tool; this remote patch was not applied to a test checkout.' }); inconclusive = true;
    } else {
      const suspicious = /-----BEGIN [A-Z ]*PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}/.test(file.content);
      checks.push({ path: file.path, type: 'static-review', status: suspicious ? 'failed' : 'passed', message: suspicious ? 'Credential-like value detected.' : 'Non-empty content and credential scan passed.' });
      if (suspicious) failed = true;
    }
  }
  const status = failed ? 'failed' : inconclusive ? 'inconclusive' : 'passed';
  return { status, passed: status === 'passed', checks, executedTests: [], summary: 'Static checks only. Repository test suites and integration tests were not executed against this uncommitted remote proposal.' };
}
