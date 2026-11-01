import { observedFetch } from './providerTelemetry.js';
import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { boundedInteger, containsCredential, redact, ServiceError } from '../utils/security.js';
import { validateRepositoryPath, validateChanges } from '../utils/repositorySafety.js';
export { validateRepositoryPath } from '../utils/repositorySafety.js';

const apiBase = 'https://api.github.com';
const conflict = message => new ServiceError(message, { status: 409, code: 'GITHUB_CONFLICT' });
const invalid = (ambiguous = false) => new ServiceError('GitHub returned a malformed response.', { code: 'GITHUB_INVALID_RESPONSE', ambiguous });
const isSha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const gitBlobSha = content => createHash('sha1').update(`blob ${Buffer.byteLength(content)}\0`).update(content).digest('hex');
const isString = value => typeof value === 'string' && value.length > 0;
function parseRepository(repo = process.env.GITHUB_REPOSITORY) {
  if (typeof repo !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}\/[A-Za-z0-9_.-]{1,100}$/.test(repo) || ['.', '..'].includes(repo.split('/')[1])) throw new ServiceError('GITHUB_REPOSITORY must be configured as owner/name.', { status: 503, code: 'CONFIGURATION_ERROR' });
  if (!process.env.GITHUB_TOKEN) throw new ServiceError('GITHUB_TOKEN is not configured.', { status: 503, code: 'CONFIGURATION_ERROR' });
  return repo.split('/');
}
function validateBranch(branch) {
  if (!isString(branch) || branch.length > 200 || /[\s\x00-\x1f~^:?*\[\\]/.test(branch) || branch.includes('..') || branch.includes('@{') || branch.split('/').some(part => !part || part.startsWith('.') || part.endsWith('.') || part.endsWith('.lock'))) throw new Error('Invalid Git branch name.');
}

async function request(path, { signal, ...options } = {}) {
  const retries = options.method && options.method !== 'GET' ? 0 : boundedInteger(process.env.GITHUB_MAX_RETRIES, 1, 0, 2);
  for (let attempt = 0; ; attempt++) {
    let response;
    try {
      const timeout = AbortSignal.timeout(boundedInteger(process.env.GITHUB_TIMEOUT_MS, 15_000, 1_000, 30_000));
      response = await observedFetch('github', `${apiBase}${path}`, {
        ...options, redirect: 'error', signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, 'X-GitHub-Api-Version': '2022-11-28', ...(options.body ? { 'Content-Type': 'application/json' } : {}) }
      }, attempt);
    } catch (error) {
      if (error.code === 'PROVIDER_QUOTA') throw error;
      if (attempt < retries && !signal?.aborted) { await delay(100 * (attempt + 1), undefined, { signal }); continue; }
      throw new ServiceError('GitHub request timed out, was canceled, or could not reach the service.', { code: 'GITHUB_NETWORK_ERROR', ambiguous: options.method && options.method !== 'GET' });
    }
    const rateLimited = response.status === 429 || response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0';
    const retryAfter = Number(response.headers.get('retry-after')) || 1;
    if (attempt < retries && (rateLimited || response.status >= 500) && retryAfter <= 2 && !signal?.aborted) {
      await response.body?.cancel();
      await delay(rateLimited ? retryAfter * 1_000 : 100 * (attempt + 1), undefined, { signal });
      continue;
    }
    let text;
    try { text = await response.text(); }
    catch { throw new ServiceError('GitHub response was interrupted; verify the isolated branch before retrying.', { code: 'GITHUB_NETWORK_ERROR', ambiguous: Boolean(options.method && options.method !== 'GET') }); }
    if (!response.ok) throw new ServiceError(`GitHub API request failed (${response.status})${rateLimited ? ': rate limit exceeded' : ''}.`, {
      status: rateLimited ? 429 : response.status === 401 || response.status === 403 ? 503 : response.status === 409 || response.status === 422 ? 409 : 502,
      code: response.status === 404 ? 'GITHUB_NOT_FOUND' : response.status === 409 || response.status === 422 ? 'GITHUB_CONFLICT' : rateLimited ? 'GITHUB_RATE_LIMIT' : 'GITHUB_API_ERROR',
      retryAfter: rateLimited ? retryAfter : undefined, ambiguous: response.status >= 500 && Boolean(options.method && options.method !== 'GET')
    });
    const mutation = Boolean(options.method && options.method !== 'GET');
    if (text.length > 10_000_000) throw invalid(mutation);
    let body;
    try { body = JSON.parse(text); } catch { throw invalid(mutation); }
    if (!body || typeof body !== 'object') throw invalid(mutation);
    return body;
  }
}

export async function getRepositoryInfo(repo, options = {}) {
  const [owner, name] = parseRepository(repo);
  const result = await request(`/repos/${owner}/${name}`, options);
  if (result.full_name?.toLowerCase() !== `${owner}/${name}`.toLowerCase() || !isString(result.default_branch) || !isString(result.html_url)) throw invalid();
  validateBranch(result.default_branch);
  return { owner, name, id: result.id, fullName: result.full_name, defaultBranch: result.default_branch, htmlUrl: `https://github.com/${owner}/${name}` };
}
export async function getDefaultBranch(repo, options) { return (await getRepositoryInfo(repo, options)).defaultBranch; }
export async function getBranchHead(repo, branch, options = {}) {
  const [owner, name] = parseRepository(repo);
  validateBranch(branch);
  const ref = await request(`/repos/${owner}/${name}/git/ref/heads/${encodeURIComponent(branch)}`, options);
  if (!isSha(ref.object?.sha)) throw invalid();
  return ref.object.sha;
}
async function getTree(info, sha, options) {
  const tree = await request(`/repos/${info.owner}/${info.name}/git/trees/${encodeURIComponent(sha)}?recursive=1`, options);
  if (tree.truncated || !Array.isArray(tree.tree)) throw new ServiceError('Repository tree is incomplete or too large to inspect safely.', { code: 'GITHUB_INCOMPLETE_TREE' });
  return tree.tree;
}
async function getFile(info, path, ref, options) {
  try {
    return await request(`/repos/${info.owner}/${info.name}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(ref)}`, options);
  } catch (error) { if (error.code === 'GITHUB_NOT_FOUND') return null; throw error; }
}

export async function getRepositoryContext(repo, branch, { maxFiles = 20, maxFileBytes = 12_000, maxTotalBytes = 48_000, query = '', signal } = {}) {
  const info = await getRepositoryInfo(repo, { signal });
  const ref = branch || info.defaultBranch;
  const baseSha = await getBranchHead(repo, ref, { signal });
  const tree = await getTree(info, baseSha, { signal });
  // Keep the COMPLETE path set: a file outside the context window is not a new file.
  const treePaths = tree.filter(item => ['blob', 'commit'].includes(item.type)).map(item => item.path);
  const words = [...new Set(query.toLowerCase().match(/[a-z][a-z0-9_-]{3,}/g) || [])];
  const score = item => words.reduce((total, word) => total + (item.path.toLowerCase().includes(word) ? 5 : 0), 0) + (/^((src|server|client)\/|package\.json$)/.test(item.path) ? 2 : 0);
  const candidates = tree.filter(item => {
    try { validateRepositoryPath(item.path); } catch { return false; }
    return item.type === 'blob' && ['100644', '100755'].includes(item.mode) && item.size <= maxFileBytes && /\.(js|jsx|mjs|cjs|ts|tsx|json|md|css|html|yml|yaml|sh|py|go|rs|java|txt)$/i.test(item.path) && !/(^|\/)(node_modules|dist|build|coverage|vendor)(\/|$)/i.test(item.path);
  }).sort((a, b) => score(b) - score(a) || a.path.localeCompare(b.path)).slice(0, Math.min(40, maxFiles));
  const files = [];
  let bytes = 0;
  for (const item of candidates) {
    if (bytes + item.size > maxTotalBytes) continue;
    const file = await getFile(info, item.path, baseSha, { signal });
    if (!file || file.type !== 'file' || file.sha !== item.sha || file.encoding !== 'base64' || typeof file.content !== 'string') throw invalid();
    const encoded = file.content.replace(/\s/g, '');
    const buffer = Buffer.from(encoded, 'base64');
    if (buffer.toString('base64') !== encoded || buffer.length !== item.size || gitBlobSha(buffer) !== file.sha) throw invalid();
    if (buffer.length > maxFileBytes || bytes + buffer.length > maxTotalBytes || buffer.includes(0)) continue;
    let content;
    try { content = new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
    catch { continue; } // Non-UTF-8 data cannot be safely rewritten as complete text.
    if (containsCredential(content)) continue; // Do not send discovered credentials to an AI provider.
    bytes += buffer.length;
    files.push({ path: item.path, sha: file.sha, content });
  }
  if (!files.length) throw new ServiceError('No safe repository source context could be retrieved; generation is blocked.', { code: 'GITHUB_EMPTY_CONTEXT' });
  return { info, branch: ref, baseSha, files, treePaths };
}

export async function createBranch(repo, branch, baseBranch, expectedBaseSha, options = {}) {
  const info = await getRepositoryInfo(repo, options);
  const base = baseBranch || info.defaultBranch;
  validateBranch(branch);
  if (branch === info.defaultBranch || base !== info.defaultBranch) throw conflict('Execution must use a new feature branch based on the current default branch.');
  const sha = await getBranchHead(repo, base, options);
  if (expectedBaseSha && sha !== expectedBaseSha) throw conflict('The default branch changed after proposal generation; regenerate and approve a fresh proposal.');
  const delivery = { branch, base, baseSha: sha, url: `${info.htmlUrl}/tree/${encodeURIComponent(branch)}` };
  try {
    const result = await request(`/repos/${info.owner}/${info.name}/git/refs`, { ...options, method: 'POST', body: JSON.stringify({ ref: `refs/heads/${branch}`, sha }) });
    if (result.ref !== `refs/heads/${branch}` || result.object?.sha !== sha) throw invalid(true);
    return delivery;
  } catch (error) { if (error.ambiguous) error.branch = delivery; throw error; }
}
export async function createUniqueBranch(repo, baseBranch, expectedBaseSha, options) {
  return createBranch(repo, `devsphere/v2-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${randomUUID()}`, baseBranch, expectedBaseSha, options);
}

export async function commitChanges(repo, branch, changes, message = 'DevSphere V2: propose repository improvements', { expectedHeadSha, signal } = {}) {
  validateChanges(changes);
  validateBranch(branch);
  const info = await getRepositoryInfo(repo, { signal });
  if (branch === info.defaultBranch) throw conflict('Writing generated changes to the default branch is forbidden.');
  let head = await getBranchHead(repo, branch, { signal });
  if (expectedHeadSha && head !== expectedHeadSha) throw conflict('The feature branch changed before execution.');
  const tree = await getTree(info, head, { signal });
  const nonRegular = tree.filter(item => item.mode === '120000' || item.type === 'commit').map(item => item.path);
  const preflight = [];
  for (const change of changes) {
    if (nonRegular.some(path => change.path === path || change.path.startsWith(`${path}/`))) throw conflict('Symlinks and submodules cannot be modified by generated proposals.');
    const current = await getFile(info, change.path, head, { signal });
    if (current && (current.type !== 'file' || !isString(current.sha))) throw conflict(`Not a regular file: ${change.path}`);
    if (change.operation === 'create' && current) throw conflict(`File already exists; refusing to overwrite: ${change.path}`);
    if (change.operation === 'update' && (!current || current.sha !== change.expectedSha)) throw conflict(`Concurrent repository change detected for ${change.path}; regenerate the proposal.`);
    preflight.push({ change, current });
  }
  let lastCommit;
  const written = [];
  try {
    for (const { change, current } of preflight) {
      if (await getBranchHead(repo, branch, { signal }) !== head) throw conflict('Concurrent feature-branch update detected; no PR will be opened.');
      const result = await request(`/repos/${info.owner}/${info.name}/contents/${change.path.split('/').map(encodeURIComponent).join('/')}`, {
        signal, method: 'PUT', body: JSON.stringify({ message: String(message).slice(0, 500), content: Buffer.from(change.content, 'utf8').toString('base64'), branch, ...(current ? { sha: current.sha } : {}) })
      });
      if (!isSha(result.commit?.sha) || !isString(result.commit?.html_url) || !Array.isArray(result.commit.parents)) throw invalid();
      lastCommit = { ...result.commit, html_url: `${info.htmlUrl}/commit/${result.commit.sha}` };
      written.push(change.path);
      // Contents API is not multi-file atomic. Detect a race, retain its audit
      // evidence on the isolated branch, and NEVER turn partial writes into a PR.
      if (lastCommit.parents.length !== 1 || lastCommit.parents[0].sha !== head) throw conflict('Concurrent commit detected during execution; inspect the isolated branch.');
      if (result.content?.sha !== gitBlobSha(change.content)) throw invalid(true);
      head = lastCommit.sha;
    }
    if (await getBranchHead(repo, branch, { signal }) !== head) throw conflict('Feature branch advanced during execution; no PR will be opened.');
  } catch (error) {
    if (lastCommit) error.partialCommit = lastCommit;
    error.partialPaths = written;
    throw error;
  }
  return { commit: lastCommit, commitSha: lastCommit.sha, commitUrl: lastCommit.html_url, branchUrl: `${info.htmlUrl}/tree/${encodeURIComponent(branch)}` };
}

export async function createPullRequest(repo, branch, base, options = {}) {
  if (!options || typeof options !== 'object') throw new Error('An approved, repository-native file proposal is required; legacy snippet PRs are disabled.');
  const info = await getRepositoryInfo(repo, { signal: options.signal });
  validateBranch(branch);
  if (branch === info.defaultBranch || base && base !== info.defaultBranch) throw conflict('PRs must come from an isolated feature branch into the current default branch.');
  if (options.expectedHeadSha && await getBranchHead(repo, branch, { signal: options.signal }) !== options.expectedHeadSha) throw conflict('Feature branch changed before PR creation.');
  if (options.expectedBaseSha && await getBranchHead(repo, info.defaultBranch, { signal: options.signal }) !== options.expectedBaseSha) throw conflict('Default branch advanced during execution; regenerate before opening a PR.');
  const pull = await request(`/repos/${info.owner}/${info.name}/pulls`, { signal: options.signal, method: 'POST', body: JSON.stringify({ title: (options.title || 'DevSphere V2: proposed changes').slice(0, 240), body: options.body || 'Review this DevSphere proposal and required CI checks before merging.', head: branch, base: info.defaultBranch }) });
  if (!Number.isInteger(pull.number) || !isString(pull.html_url) || pull.base?.ref !== info.defaultBranch || pull.head?.ref !== branch || pull.state !== 'open' || !isSha(pull.head?.sha) || options.expectedHeadSha && pull.head.sha !== options.expectedHeadSha || pull.base?.repo?.full_name?.toLowerCase() !== info.fullName.toLowerCase() || pull.head?.repo?.full_name?.toLowerCase() !== info.fullName.toLowerCase()) throw Object.assign(invalid(true), { candidatePull: { branch, base: info.defaultBranch, number: Number.isInteger(pull.number) ? pull.number : null } });
  return { number: pull.number, url: `${info.htmlUrl}/pull/${pull.number}`, state: pull.state, base: pull.base.ref, head: pull.head.ref };
}
export async function getPullRequest(repo, number, options) {
  const [owner, name] = parseRepository(repo);
  if (!Number.isInteger(Number(number)) || Number(number) < 1) throw new Error('Invalid pull request number.');
  const pull = await request(`/repos/${owner}/${name}/pulls/${number}`, options);
  if (pull.number !== Number(number) || typeof pull.merged !== 'boolean') throw invalid();
  return pull;
}

async function getPages(path, key, options) {
  const all = [];
  for (let page = 1; page <= 10; page++) {
    const body = await request(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`, options);
    const items = key ? body[key] : body;
    if (!Array.isArray(items) || key && (!Number.isInteger(body.total_count) || body.total_count < 0 || items.length < 100 && body.total_count > all.length + items.length)) throw invalid();
    all.push(...items);
    if (items.length < 100) return all;
  }
  throw new ServiceError('Too many CI check records to verify safely.', { code: 'GITHUB_CHECK_LIMIT' });
}
const safeGithubURL = value => {
  try { const url = new URL(value); return url.protocol === 'https:' && url.hostname === 'github.com' && !url.username && !url.password ? url.href : null; } catch { return null; }
};
async function requiredDefinitions(owner, name, branch, options) {
  validateBranch(branch);
  let protection = {};
  try { protection = await request(`/repos/${owner}/${name}/branches/${encodeURIComponent(branch)}/protection/required_status_checks`, options); }
  catch (error) { if (error.code !== 'GITHUB_NOT_FOUND') throw error; }
  // Rulesets can impose requirements not visible in legacy branch protection.
  const rules = await request(`/repos/${owner}/${name}/rules/branches/${encodeURIComponent(branch)}`, options);
  if (!Array.isArray(rules) || protection.checks !== undefined && !Array.isArray(protection.checks) || protection.contexts !== undefined && !Array.isArray(protection.contexts)) throw invalid();
  const definitions = (protection.checks || []).map(c => ({ name: c.context, appId: c.app_id ?? null }));
  for (const name of protection.contexts || []) if (!definitions.some(c => c.name === name)) definitions.push({ name, appId: null });
  for (const rule of rules) {
    if (['workflows', 'required_deployments'].includes(rule.type)) throw new ServiceError('Additional ruleset requirements need operator verification.', { code: 'GITHUB_UNSUPPORTED_RULE' });
    if (rule.type !== 'required_status_checks') continue;
    if (!Array.isArray(rule.parameters?.required_status_checks)) throw invalid();
    for (const check of rule.parameters.required_status_checks) definitions.push({ name: check.context, appId: check.integration_id ?? null });
  }
  if (definitions.length > 100 || definitions.some(c => !isString(c.name) || c.name.length > 200 || c.appId !== null && !Number.isInteger(c.appId))) throw invalid();
  return [...new Map(definitions.map(c => [`${c.name}:${c.appId}`, c])).values()];
}
export async function getCommitChecks(repo, sha, branch, options = {}) {
  if (!isSha(sha)) throw invalid();
  const [owner, name] = parseRepository(repo);
  const root = `/repos/${owner}/${name}/commits/${sha}`;
  // Always read actual checks, even when protection isn't visible.
  const [runs, statuses, discovery] = await Promise.all([
    getPages(`${root}/check-runs?filter=latest`, 'check_runs', options), getPages(`${root}/statuses`, undefined, options),
    requiredDefinitions(owner, name, branch, options).then(definitions => ({ definitions }), error => ({ error }))
  ]);
  if (runs.length + statuses.length > 100) throw new ServiceError('CI evidence exceeds the bounded record limit.', { code: 'GITHUB_CHECK_LIMIT' });
  if (runs.some(r => r.head_sha !== sha || !isString(r.name) || !Number.isInteger(r.id) || !['queued', 'in_progress', 'completed', 'waiting', 'pending', 'requested'].includes(r.status)) || statuses.some(s => !isString(s.context) || !Number.isInteger(s.id) || !['pending', 'success', 'failure', 'error'].includes(s.state))) throw invalid();
  const observed = [
    ...runs.map(r => ({ source: 'check-run', name: r.name.slice(0, 200), status: r.status, conclusion: r.conclusion, appId: r.app?.id ?? null, id: r.id, at: r.started_at || '', url: safeGithubURL(r.html_url || r.details_url), summary: redact(String(r.output?.title || '').slice(0, 500)) })),
    ...statuses.map(s => ({ source: 'status', name: s.context.slice(0, 200), status: s.state === 'pending' ? 'in_progress' : 'completed', conclusion: s.state, appId: null, id: s.id, at: s.created_at || '', url: safeGithubURL(s.target_url), summary: redact(String(s.description || '').slice(0, 500)) }))
  ].sort((a, b) => String(b.at).localeCompare(String(a.at)) || b.id - a.id);
  const latest = [...new Map([...observed].reverse().map(c => [`${c.source}:${c.name}:${c.appId}`, c])).values()];
  const definitions = discovery.definitions || [];
  const checks = definitions.map(required => {
    const matching = latest.filter(c => c.name === required.name && (required.appId == null || required.appId === -1 || c.appId === required.appId));
    const passed = matching.length > 0 && matching.every(c => c.status === 'completed' && c.conclusion === 'success');
    return { ...required, status: passed ? 'completed' : matching[0]?.status || 'missing', conclusion: passed ? 'success' : 'not-successful', observed: matching };
  });
  let state = 'successful';
  if (discovery.error) state = 'inaccessible';
  else if (!definitions.length || !latest.length || checks.some(c => c.status === 'missing')) state = 'missing';
  else if (latest.some(c => ['failure', 'error', 'timed_out', 'action_required', 'startup_failure'].includes(c.conclusion))) state = 'failed';
  else if (latest.some(c => c.conclusion === 'cancelled')) state = 'cancelled';
  else if (latest.some(c => c.status === 'in_progress')) state = 'in_progress';
  else if (latest.some(c => ['queued', 'pending', 'waiting', 'requested'].includes(c.status))) state = 'queued';
  else if (checks.some(c => c.conclusion !== 'success') || latest.some(c => c.conclusion !== 'success')) state = 'missing';
  return { repository: repo, sha, baseBranch: branch, state, required: definitions.map(c => c.name), checks, observed: latest, passed: state === 'successful', configured: !discovery.error && definitions.length > 0, ...(discovery.error ? { reason: 'Required checks/rules are inaccessible or unsupported.', errorCode: discovery.error.code } : !definitions.length ? { reason: 'No applicable required checks could be verified.' } : {}) };
}
export const getRequiredChecks = getCommitChecks;
export async function getPullRequestChecks(repo, number, expectedHeadSha, options = {}) {
  const at = new Date().toISOString();
  let headSha = null; let baseBranch = null;
  try {
    const info = await getRepositoryInfo(repo, options);
    const pull = await getPullRequest(repo, number, options);
    if (pull.base?.repo?.full_name?.toLowerCase() !== info.fullName.toLowerCase() || pull.head?.repo?.full_name?.toLowerCase() !== info.fullName.toLowerCase() || !isSha(pull.head?.sha) || !isString(pull.base?.ref)) throw invalid();
    headSha = pull.head.sha; baseBranch = pull.base.ref;
    const checks = await getCommitChecks(repo, headSha, baseBranch, options);
    // Re-read after API fan-out: a head change during refresh invalidates success.
    const latest = await getPullRequest(repo, number, options);
    const stale = latest.head?.sha !== headSha || headSha !== expectedHeadSha || baseBranch !== info.defaultBranch || latest.base?.ref !== baseBranch;
    return { ...checks, pullNumber: Number(number), headSha, latestCommitSha: latest.head?.sha || null, expectedHeadSha, baseBranch, defaultBranch: info.defaultBranch, checkedAt: at, state: stale ? 'stale' : checks.state, passed: !stale && checks.passed };
  } catch (error) {
    return { repository: repo, pullNumber: Number(number), expectedHeadSha, headSha, baseBranch, checkedAt: at, state: 'inaccessible', passed: false, errorCode: error.code || 'GITHUB_INVALID_RESPONSE', reason: 'GitHub status could not be verified. Refresh after resolving provider access; do not retry writes.' };
  }
}
export default { getDefaultBranch, getBranchHead, createBranch, createUniqueBranch, commitChanges, createPullRequest, getRepositoryInfo, getRepositoryContext, validateRepositoryPath, getPullRequest, getRequiredChecks };

// Complete, immutable, bounded text snapshot for the isolated QA runner. Secret
// paths are excluded; symlinks/submodules/binary or oversized sources fail closed.
export async function getQASnapshot(repo, sha, options = {}) {
  if (!isSha(sha)) throw invalid();
  const { snapshotPath, validateSnapshot } = await import('./qa/policy.js');
  const info = await getRepositoryInfo(repo, options);
  const tree = await getTree(info, sha, options);
  const files = []; let bytes = 0;
  for (const entry of tree) {
    if (entry.type === 'tree') continue;
    try { snapshotPath(entry.path); } catch { continue; }
    if (entry.type !== 'blob' || !['100644', '100755'].includes(entry.mode) || entry.size > 500_000 || files.length >= 500 || bytes + entry.size > 1_500_000) throw new ServiceError('QA snapshot is unsupported or exceeds limits.', { code: 'unsupported' });
    const file = await getFile(info, entry.path, sha, options);
    if (file?.encoding !== 'base64' || typeof file.content !== 'string') throw invalid();
    const buffer = Buffer.from(file.content.replace(/\s/g, ''), 'base64');
    if (gitBlobSha(buffer) !== entry.sha || buffer.includes(0)) throw invalid();
    const content = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    if (containsCredential(content)) throw new Error('QA snapshot contains credential-like content.');
    files.push({ path: entry.path, content }); bytes += buffer.length;
  }
  return validateSnapshot(files);
}
