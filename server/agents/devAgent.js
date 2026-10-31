import { generateFileChanges } from '../services/aiService.js';
import { getRepositoryContext, validateRepositoryPath } from '../services/githubService.js';

export async function devAgent({ repo, branch, intent, plan }, options) {
  if (!repo) throw new Error('No target repository configured.');
  const context = await getRepositoryContext(repo, branch);
  const generated = await generateFileChanges({ intent, plan, files: context.files.map(({ path, content }) => ({ path, content })) }, options);
  if (!Array.isArray(generated?.changes) || generated.changes.length < 1 || generated.changes.length > 20) throw new Error('Developer agent returned an invalid file-change set.');
  const seen = new Set();
  const existing = new Set(context.treePaths);
  const changes = generated.changes.map(change => {
    const path = validateRepositoryPath(change.path);
    if (!/\.(js|jsx|mjs|cjs|ts|tsx|json|md|css|html|yml|yaml|sh|py|go|rs|java|txt|svg|xml|toml)$/i.test(path)) throw new Error(`Unsupported or non-text generated file: ${path}`);
    if (seen.has(path)) throw new Error(`Duplicate generated path: ${path}`);
    seen.add(path);
    if (typeof change.content !== 'string' || change.content.length > 250_000 || !change.content.trim()) throw new Error(`Generated content is empty or too large: ${path}`);
    const shouldUpdate = existing.has(path);
    if (change.operation !== (shouldUpdate ? 'update' : 'create')) throw new Error(`Generated operation does not match repository state for ${path}.`);
    if (/(?:-----BEGIN [A-Z ]*PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|\bBearer\s+[A-Za-z0-9._-]{20,}|(?:api[_-]?key|password|secret|token)\s*[:=]\s*["'`][^"'`]{8,}["'`])/i.test(change.content)) throw new Error(`Generated content appears to contain credentials: ${path}`);
    const existingFile = context.files.find(file => file.path === path);
    if (shouldUpdate && !existingFile) throw new Error(`Cannot safely update a file without its current contents and blob SHA: ${path}`);
    return { path, operation: change.operation, content: change.content, reason: String(change.reason || '').slice(0, 500), expectedSha: existingFile?.sha || null };
  });
  const totalBytes = changes.reduce((total, change) => total + Buffer.byteLength(change.content, 'utf8'), 0);
  if (totalBytes > 400_000) throw new Error('Generated proposal exceeds the safe storage limit; ask for a smaller set of changes.');
  return { changes, repository: context.info.fullName, defaultBranch: context.info.defaultBranch, contextFiles: context.files.length };
}
