import { containsCredential } from './security.js';

export function validateRepositoryPath(path) {
  if (typeof path !== 'string' || path !== path.trim() || !path || path.length > 240 || /[\x00-\x1f\x7f:*?<>|]/.test(path)) throw new Error('Invalid file path.');
  if (path.startsWith('/') || path.includes('\\') || path.split('/').some(part => !part || part === '.' || part === '..' || part.toLowerCase() === '.git')) throw new Error(`Unsafe repository path: ${path}`);
  if (/(^|\/)(?:\.env(?:\.[^/]*)?|\.npmrc|\.pypirc|credentials?(?:\.[^/]*)?|secrets?(?:\.[^/]*)?|serviceaccount[^/]*\.json|id_rsa(?:\.[^/]*)?|id_ed25519(?:\.[^/]*)?|package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml)(?:\/|$)/i.test(path) || /\.(pem|key|p12|pfx)$/i.test(path)) throw new Error(`Sensitive or protected path is not allowed: ${path}`);
  return path;
}

export function validateChanges(changes) {
  if (!Array.isArray(changes) || !changes.length || changes.length > 20) throw new Error('A proposal must contain between 1 and 20 file changes.');
  const seen = new Set();
  let totalBytes = 0;
  for (const change of changes) {
    const path = validateRepositoryPath(change?.path);
    if (seen.has(path)) throw new Error(`Duplicate generated path: ${path}`);
    seen.add(path);
    if (!['create', 'update'].includes(change.operation)) throw new Error(`Invalid operation for ${path}.`);
    if (typeof change.content !== 'string' || !change.content.trim() || Buffer.byteLength(change.content) > 250_000 || change.content.includes('\0')) throw new Error(`Generated content is empty, binary, or too large: ${path}`);
    if (containsCredential(change.content)) throw new Error(`Generated content appears to contain credentials: ${path}`);
    if (change.operation === 'update' && (typeof change.expectedSha !== 'string' || !change.expectedSha)) throw new Error(`An existing blob SHA is required for ${path}.`);
    if (change.operation === 'create' && change.expectedSha != null) throw new Error(`A new file must not have a blob SHA: ${path}.`);
    totalBytes += Buffer.byteLength(change.content);
  }
  if (totalBytes > 400_000) throw new Error('Generated proposal exceeds the safe storage limit; ask for fewer changes.');
  return changes;
}

export function validateProjectFiles(files) {
  if (!Array.isArray(files) || files.length > 100) throw new TypeError('files must be an array with at most 100 entries.');
  const names = new Set();
  let size = 0;
  for (const file of files) {
    const name = validateRepositoryPath(file?.name);
    if (names.has(name)) throw new TypeError('File names must be unique.');
    names.add(name);
    if (typeof file.content !== 'string' || typeof file.language !== 'string' || file.language.length > 40) throw new TypeError('Each file requires string content and language.');
    size += Buffer.byteLength(file.content);
  }
  if (size > 600_000) throw new TypeError('Project files exceed the storage limit.');
  return files.map(({ name, content, language }) => ({ name, content, language }));
}
