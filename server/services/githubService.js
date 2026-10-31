import { randomUUID } from 'node:crypto';

const apiBase = 'https://api.github.com';
const token = () => process.env.GITHUB_TOKEN;
const repository = () => process.env.GITHUB_REPOSITORY;

export function validateRepositoryPath(path) {
  if (typeof path !== 'string' || !path.trim() || path.length > 240) throw new Error('Invalid file path.');
  const normalized = path.trim();
  if (normalized.startsWith('/') || normalized.includes('\\') || normalized.split('/').some(part => !part || part === '.' || part === '..')) throw new Error(`Unsafe repository path: ${normalized}`);
  if (/(^|\/)(?:\.env(?:\.[^/]*)?|\.npmrc|\.pypirc|credentials?(?:\.[^/]*)?|secrets?(?:\.[^/]*)?|serviceaccount[^/]*\.json|id_rsa(?:\.[^/]*)?|id_ed25519(?:\.[^/]*)?|package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml)(?:\/|$)/i.test(normalized) || /\.(pem|key|p12|pfx)$/i.test(normalized) || normalized.startsWith('.git/')) {
    throw new Error(`Sensitive or protected path is not allowed: ${normalized}`);
  }
  return normalized;
}

function parseRepository(repo = repository()) {
  if (!repo || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) throw new Error('GITHUB_REPOSITORY must be configured as owner/name.');
  if (!token()) throw new Error('GITHUB_TOKEN is not configured.');
  return repo.split('/');
}

async function request(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    signal: options.signal || AbortSignal.timeout(Number(process.env.GITHUB_TIMEOUT_MS) || 20_000),
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token()}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers
    }
  });
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { body = { message: text.slice(0, 300) }; }
  if (!response.ok) {
    const error = new Error(`GitHub API ${response.status}: ${body.message || response.statusText}`);
    error.status = response.status;
    error.code = response.status === 409 || response.status === 422 ? 'GITHUB_CONFLICT' : 'GITHUB_API_ERROR';
    throw error;
  }
  return body;
}

export async function getRepositoryInfo(repo) {
  const [owner, name] = parseRepository(repo);
  const result = await request(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`);
  return { owner, name, fullName: result.full_name, defaultBranch: result.default_branch, htmlUrl: result.html_url };
}

export async function getDefaultBranch(repo) {
  return (await getRepositoryInfo(repo)).defaultBranch;
}

export async function getRepositoryContext(repo, branch, { maxFiles = 40, maxFileBytes = 12_000 } = {}) {
  const info = await getRepositoryInfo(repo);
  const ref = branch || info.defaultBranch;
  const tree = await request(`/repos/${info.owner}/${info.name}/git/trees/${encodeURIComponent(ref)}?recursive=1`);
  if (tree.truncated) throw new Error('Repository tree is too large to inspect safely.');
  const candidates = tree.tree.filter(item => item.type === 'blob' && item.size <= maxFileBytes && !/(^|\/)(node_modules|dist|build|coverage|\.git)(\/|$)/i.test(item.path)).slice(0, maxFiles);
  const safeCandidates = candidates.filter(item => { try { validateRepositoryPath(item.path); return true; } catch { return false; } });
  const files = [];
  for (const item of safeCandidates) {
    const path = item.path;
    if (!/\.(js|jsx|ts|tsx|json|md|css|html|yml|yaml|sh|py|go|rs|java|txt)$/i.test(path)) continue;
    const contentResponse = await request(`/repos/${info.owner}/${info.name}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(ref)}`);
    if (contentResponse.encoding !== 'base64' || !contentResponse.content) continue;
    const content = Buffer.from(contentResponse.content.replace(/\n/g, ''), 'base64').toString('utf8');
    files.push({ path, sha: contentResponse.sha, content: content.slice(0, maxFileBytes) });
  }
  return { info, branch: ref, files, treePaths: safeCandidates.map(item => item.path).slice(0, maxFiles) };
}

export async function createBranch(repo, branch, baseBranch) {
  const info = await getRepositoryInfo(repo);
  const base = baseBranch || info.defaultBranch;
  const ref = await request(`/repos/${info.owner}/${info.name}/git/ref/heads/${encodeURIComponent(base)}`);
  const sha = ref.object.sha;
  await request(`/repos/${info.owner}/${info.name}/git/refs`, { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${branch}`, sha }) });
  return { branch, base, baseSha: sha, url: `${info.htmlUrl}/tree/${encodeURIComponent(branch)}` };
}

export async function createUniqueBranch(repo, baseBranch) {
  const branch = `devsphere/v2-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${randomUUID().slice(0, 8)}`;
  return createBranch(repo, branch, baseBranch);
}

export async function commitChanges(repo, branch, changes, message = 'DevSphere V2: propose repository improvements') {
  const info = await getRepositoryInfo(repo);
  let lastCommit;
  for (const [index, change] of changes.entries()) {
    try {
      const path = validateRepositoryPath(change.path);
      const endpoint = `/repos/${info.owner}/${info.name}/contents/${path.split('/').map(encodeURIComponent).join('/')}`;
      let current;
      try { current = await request(`${endpoint}?ref=${encodeURIComponent(branch)}`); }
      catch (error) { if (error.status !== 404) throw error; }
      if (change.operation === 'create' && current) throw new Error(`File already exists; refusing to overwrite: ${path}`);
      if (change.operation === 'update' && !current) throw new Error(`Cannot update missing file: ${path}`);
      if (change.operation === 'update' && (!change.expectedSha || current.sha !== change.expectedSha)) {
        const error = new Error(`Concurrent repository change detected for ${path}; regenerate the proposal from the current branch.`);
        error.code = 'GITHUB_CONFLICT';
        throw error;
      }
      const content = Buffer.from(change.content, 'utf8').toString('base64');
      const result = await request(endpoint, { method: 'PUT', body: JSON.stringify({ message, content, branch, ...(current?.sha ? { sha: current.sha } : {}) }) });
      lastCommit = result.commit;
    } catch (error) {
      if (lastCommit) error.partialCommit = lastCommit;
      error.partialPaths = changes.slice(0, index).map(item => item.path);
      throw error;
    }
  }
  return { commit: lastCommit, commitSha: lastCommit?.sha, commitUrl: lastCommit?.html_url, branchUrl: `${info.htmlUrl}/tree/${encodeURIComponent(branch)}` };
}

export async function createPullRequest(repo, branch, base, options = {}) {
  // Compatibility for the existing webhook self-healing route: commit a new isolated
  // source file on a feature branch, never write the default branch directly.
  if (typeof options === 'string') {
    const code = branch;
    const requestedBranch = base;
    const info = await getRepositoryInfo(repo);
    const newBranch = await createBranch(repo, requestedBranch, info.defaultBranch);
    const path = `devsphere-fixes/fix-${randomUUID()}.js`;
    const committed = await commitChanges(repo, newBranch.branch, [{ path, operation: 'create', content: String(code), expectedSha: null, reason: 'Legacy self-healing fix proposal' }], options || 'DevSphere self-healing proposal');
    const pull = await openPull(repo, newBranch.branch, newBranch.base, { title: options || 'DevSphere self-healing proposal', body: `Automated fix proposal from the existing webhook workflow.\n\nCommit: ${committed.commitUrl}` });
    return pull.url;
  }
  return openPull(repo, branch, base, options);
}

async function openPull(repo, branch, base, { title, body } = {}) {
  const info = await getRepositoryInfo(repo);
  const pull = await request(`/repos/${info.owner}/${info.name}/pulls`, { method: 'POST', body: JSON.stringify({
    title: title || 'DevSphere V2: proposed changes',
    body: body || 'Automated proposal generated by DevSphere V2. Review the changes and required checks before merging.',
    head: branch,
    base: base || info.defaultBranch
  }) });
  return { number: pull.number, url: pull.html_url, state: pull.state, base: pull.base.ref, head: pull.head.ref };
}

export async function getPullRequest(repo, number) {
  const [owner, name] = parseRepository(repo);
  return request(`/repos/${owner}/${name}/pulls/${encodeURIComponent(number)}`);
}

export async function getRequiredChecks(repo, sha, branch) {
  const [owner, name] = parseRepository(repo);
  let protection;
  try {
    protection = await request(`/repos/${owner}/${name}/branches/${encodeURIComponent(branch)}/protection/required_status_checks`);
  } catch (error) {
    if (error.status === 404) return { required: [], checks: [], passed: false, configured: false, reason: 'No branch-protection required status checks could be verified.' };
    throw error;
  }
  const required = [...new Set([...(protection.contexts || []), ...(protection.checks || []).map(check => check.context)])];
  if (!required.length) return { required, checks: [], passed: false, configured: false, reason: 'Branch protection has no required checks configured.' };
  const [checkRuns, statuses] = await Promise.all([
    request(`/repos/${owner}/${name}/commits/${encodeURIComponent(sha)}/check-runs`),
    request(`/repos/${owner}/${name}/commits/${encodeURIComponent(sha)}/status`)
  ]);
  const observed = [
    ...checkRuns.check_runs.map(run => ({ name: run.name, status: run.status, conclusion: run.conclusion })),
    ...(statuses.statuses || []).map(status => ({ name: status.context, status: status.state === 'pending' ? 'in_progress' : 'completed', conclusion: status.state === 'success' ? 'success' : status.state }))
  ];
  const checks = required.map(name => ({ name, ...(observed.find(check => check.name === name) || { status: 'missing', conclusion: null }) }));
  return { required, checks, passed: checks.every(check => check.status === 'completed' && check.conclusion === 'success'), configured: true };
}

export default { getDefaultBranch, createBranch, commitChanges, createPullRequest, getRepositoryInfo, getRepositoryContext, validateRepositoryPath };
