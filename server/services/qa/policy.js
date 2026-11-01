import { validateRepositoryPath } from '../../utils/repositorySafety.js';
import { containsCredential } from '../../utils/security.js';

export const LIMITS = Object.freeze({ cpu: 1, memoryMb: 512, processes: 64, diskMb: 256, timeoutMs: 60_000, outputBytes: 8192 });
export const COMMANDS = Object.freeze({
  install: ['npm', 'ci', '--offline', '--ignore-scripts', '--no-audit', '--no-fund'],
  build: ['npm', 'run', 'build'],
  test: ['npm', 'test', '--', '--run'],
  json: ['node', '/opt/qa/json-check.mjs']
});
export function snapshotPath(path) {
  // Lockfiles are read-only inputs, never generated changes. No general bypass.
  return /(^|\/)(package-lock\.json|npm-shrinkwrap\.json)$/.test(path)
    ? validateRepositoryPath(path.replace(/[^/]+$/, 'qa-lock-input.json')) && path
    : validateRepositoryPath(path);
}
export function validateSnapshot(files) {
  if (!Array.isArray(files) || !files.length || files.length > 500 || Buffer.byteLength(JSON.stringify(files)) > 2_000_000) throw new Error('Snapshot is incomplete or exceeds sandbox input limits.');
  const paths = new Set();
  for (const file of files) {
    snapshotPath(file.path);
    if (paths.has(file.path) || typeof file.content !== 'string' || file.content.includes('\0') || containsCredential(file.content)) throw new Error('Unsafe snapshot input.');
    paths.add(file.path);
  }
  for (const path of paths) if (path.split('/').slice(0, -1).some((_, i, parts) => paths.has(parts.slice(0, i + 1).join('/')))) throw new Error('File/directory collision.');
  return files;
}
export function commandPolicy(files, requested) {
  validateSnapshot(files);
  if (!Array.isArray(requested) || !requested.length || new Set(requested).size !== requested.length || requested.some(id => !Object.hasOwn(COMMANDS, id))) throw new Error('Command policy rejected the requested validation.');
  if (!requested.some(id => ['build', 'test', 'json'].includes(id))) throw new Error('Installation alone is not validation.');
  if (requested.every(id => id === 'json') && files.some(f => /\.(js|jsx|mjs|cjs|ts|tsx)$/i.test(f.path))) throw Object.assign(new Error('JSON parsing cannot validate source code.'), { code: 'unsupported' });
  const manifest = files.find(f => f.path === 'package.json');
  if (requested.some(id => id !== 'json')) {
    if (!manifest) throw Object.assign(new Error('Root package.json is required.'), { code: 'unsupported' });
    const pkg = JSON.parse(manifest.content);
    for (const id of requested.filter(id => ['build', 'test'].includes(id))) if (typeof pkg.scripts?.[id] !== 'string') throw Object.assign(new Error(`Missing ${id} script.`), { code: 'missing_dependencies' });
    if (requested.includes('install') && !files.some(f => ['package-lock.json', 'npm-shrinkwrap.json'].includes(f.path))) throw Object.assign(new Error('Offline install requires a lockfile and a pre-provisioned cache.'), { code: 'missing_dependencies' });
  }
  return requested.map(id => ({ id, argv: [...COMMANDS[id]] }));
}
