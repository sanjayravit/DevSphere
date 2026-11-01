import { generateFileChanges } from '../services/aiService.js';
import { getRepositoryContext, validateRepositoryPath } from '../services/githubService.js';
import { validateChanges } from '../utils/repositorySafety.js';

export function createDevAgent({ getContext = getRepositoryContext, generateChanges = generateFileChanges } = {}) {
  return async function devAgent({ repo, branch, intent, plan }, options = {}) {
    if (!repo) throw new Error('GITHUB_REPOSITORY is not configured.');
    const context = await getContext(repo, branch, { signal: options.signal, query: `${intent.summary} ${plan.tasks.join(' ')}` });
    const generated = await generateChanges({ intent, plan, files: context.files.map(({ path, content }) => ({ path, content })), treePaths: context.treePaths.slice(0, 400) }, options);
    if (!Array.isArray(generated?.changes)) throw new Error('Developer agent returned an invalid file-change set.');
    const existing = new Set(context.treePaths);
    const changes = generated.changes.map(change => {
      const path = validateRepositoryPath(change.path);
      if (!/\.(js|jsx|mjs|cjs|ts|tsx|json|md|css|html|yml|yaml|sh|py|go|rs|java|txt|svg|xml|toml)$/i.test(path)) throw new Error(`Unsupported or non-text generated file: ${path}`);
      const shouldUpdate = existing.has(path);
      if (change.operation !== (shouldUpdate ? 'update' : 'create')) throw new Error(`Generated operation does not match repository state for ${path}.`);
      const file = context.files.find(item => item.path === path);
      if (shouldUpdate && !file) throw new Error(`Cannot safely update a file without its complete contents and blob SHA: ${path}`);
      return { path, operation: change.operation, content: change.content, reason: String(change.reason || '').slice(0, 500), expectedSha: file?.sha || null };
    });
    validateChanges(changes);
    return { changes, repository: context.info.fullName, defaultBranch: context.info.defaultBranch, baseSha: context.baseSha, contextFiles: context.files.length };
  };
}
export const devAgent = createDevAgent();
