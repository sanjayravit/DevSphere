import { executeQA } from '../services/qa/executionService.js';
import { parse } from '@babel/parser';
import { validateRepositoryPath } from '../utils/repositorySafety.js';
import { containsCredential } from '../utils/security.js';

export function createQAAgent({ execute = executeQA } = {}) {
return async function qaAgent(input, options = {}) {
  const { changes } = input;
  const checks = [];
  for (const file of changes || []) {
    try {
      validateRepositoryPath(file.path);
      if (typeof file.content !== 'string' || !file.content.trim()) throw new Error('File content is empty.');
      if (containsCredential(file.content)) throw new Error('Credential-like value detected.');
      if (/\.json$/i.test(file.path)) {
        JSON.parse(file.content);
        checks.push({ path: file.path, type: 'json-parse', status: 'passed', message: 'Valid JSON.' });
      } else if (/\.(mjs|cjs|js|jsx|ts|tsx)$/i.test(file.path)) {
        const plugins = [];
        if (/\.(jsx|tsx|js)$/i.test(file.path)) plugins.push('jsx');
        if (/\.(ts|tsx)$/i.test(file.path)) plugins.push('typescript');
        parse(file.content, { sourceType: /\.cjs$/i.test(file.path) ? 'commonjs' : /\.mjs$/i.test(file.path) ? 'module' : 'unambiguous', plugins });
        checks.push({ path: file.path, type: 'javascript-syntax', status: 'passed', message: 'Source syntax parsed; imports, types and runtime behavior are not verified.' });
      } else if (/\.(md|txt)$/i.test(file.path)) {
        checks.push({ path: file.path, type: 'text-safety', status: 'passed', message: 'Non-empty text and credential scan passed.' });
      } else {
        checks.push({ path: file.path, type: 'source-review', status: 'inconclusive', message: 'This file type requires the target repository validation tools.' });
      }
    } catch (error) {
      checks.push({ path: file.path || '(missing)', type: 'static-validation', status: 'failed', message: error.message.slice(0, 500) });
    }
  }
  const status = checks.some(check => check.status === 'failed') ? 'failed' : !checks.length || checks.some(check => check.status === 'inconclusive') ? 'inconclusive' : 'passed';
  const execution = status === 'passed' ? await execute(input, options) : { kind: 'sandbox', status: 'inconclusive', state: 'static_blocked', commands: [] };
  const finalStatus = status === 'failed' ? 'failed' : status === 'inconclusive' ? 'inconclusive' : execution.status;
  return { status: finalStatus, passed: finalStatus === 'passed', checks: checks.map(check => ({ ...check, kind: 'static' })), execution, executedTests: execution.commands, summary: `Static: ${status}. Sandbox: ${execution.state}. Only completed sandbox validation can satisfy mandatory QA; CI and independent deployment gates still apply.` };
}

}
export const qaAgent = createQAAgent();
