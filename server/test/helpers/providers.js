import { createHash } from 'node:crypto';
export const repositoryInfo = { id: 12345, default_branch: 'trunk', full_name: 'example/project', html_url: 'https://github.com/example/project' };
export const baseSha = 'a'.repeat(40);
export const blobSha = content => createHash('sha1').update(`blob ${Buffer.byteLength(content)}\0`).update(content).digest('hex');
const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(Array.isArray(value?.check_runs) ? { total_count: value.check_runs.length, ...value } : value), { status, headers: { 'content-type': 'application/json', ...headers } });
export function mockProviders(t, configuration = {}) {
  const original = globalThis.fetch;
  const environment = { GITHUB_REPOSITORY: 'example/project', GITHUB_TOKEN: 'mock-github-credential', OPENAI_API_KEY: 'mock-openai-credential', OPENAI_MAX_RETRIES: '0', GITHUB_MAX_RETRIES: '0', JWT_SECRET: 'test-only-session-secret-at-least-32-bytes', V2_ALLOWED_USER_IDS: 'user-a,user-b,http-test-user' };
  const old = Object.fromEntries(Object.keys(environment).map(key => [key, process.env[key]]));
  Object.assign(process.env, environment);
  t.after(() => { globalThis.fetch = original; for (const [key, value] of Object.entries(old)) if (value === undefined) delete process.env[key]; else process.env[key] = value; });
  const initialFiles = configuration.files || { 'src/helper.js': 'export const value = 1;\n' };
  const initial = new Map(Object.entries(initialFiles).map(([path, content]) => [path, { path, content, sha: blobSha(content), mode: '100644', type: 'blob' }]));
  const snapshots = new Map([[baseSha, initial]]);
  const branches = new Map([['trunk', baseSha]]);
  const pulls = new Map();
  const calls = [];
  const aiCalls = [];
  let commitCounter = 10;
  const intent = configuration.intent || { summary: 'Improve the helper with a bounded change', steps: ['Update the helper'], acceptanceCriteria: ['The behavior is preserved'] };
  const plan = configuration.plan || { tasks: ['Update the helper'], priority: 'normal', risk: 'low', impact: 'file', confidence: 95, issue: 'The helper needs an improvement', suggestedFix: 'Make a small defensive change' };
  const generated = configuration.generated || { changes: [{ path: 'src/helper.js', operation: 'update', content: 'export const value = 2;\n', reason: 'Use the requested value' }] };
  const state = { calls, aiCalls, branches, snapshots, pulls, plan, generated, json, info: { ...repositoryInfo } };
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return original(input, options);
    const method = options.method || 'GET';
    const body = options.body ? JSON.parse(options.body) : null;
    const call = { url: String(url), path: decodeURIComponent(url.pathname), method, body, signal: options.signal };
    calls.push(call);
    if (url.hostname === 'api.openai.com') {
      aiCalls.push(call);
      if (configuration.ai) return configuration.ai(call, state);
      const name = body.text?.format?.name;
      const value = name === 'devsphere_intent' ? intent : name === 'devsphere_plan' ? plan : generated;
      return json({ id: `resp_mock_${aiCalls.length}`, object: 'response', status: 'completed', model: body.model, output: [{ type: 'message', id: 'msg_mock', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: JSON.stringify(value), annotations: [] }] }], usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 } });
    }
    if (url.hostname === 'generativelanguage.googleapis.com' && configuration.gemini) return configuration.gemini(call, state);
    if (url.hostname === 'api.vercel.com' && configuration.vercel) return configuration.vercel(call, state);
    if (url.hostname !== 'api.github.com') throw new Error(`Unexpected outbound provider in mocked test: ${url.hostname}`);
    const intercepted = await configuration.github?.(call, state);
    if (intercepted) return intercepted;
    const path = call.path.replace('/repos/example/project', '');
    if (!path) return json(state.info);
    if (path.startsWith('/git/ref/heads/') && method === 'GET') {
      const branch = path.slice('/git/ref/heads/'.length);
      return branches.has(branch) ? json({ ref: `refs/heads/${branch}`, object: { sha: branches.get(branch) } }) : json({ message: 'Not Found' }, 404);
    }
    if (path === '/git/refs' && method === 'POST') {
      const branch = body.ref.replace('refs/heads/', '');
      if (branches.has(branch)) return json({ message: 'Reference already exists' }, 422);
      branches.set(branch, body.sha);
      return json({ ref: body.ref, object: { sha: body.sha } }, 201);
    }
    if (path.startsWith('/git/trees/')) {
      const ref = path.slice('/git/trees/'.length);
      const files = snapshots.get(branches.get(ref) || ref);
      return files ? json({ sha: ref, truncated: false, tree: [...files.values()].map(({ path, sha, mode, type, content }) => ({ path, sha, mode, type, size: Buffer.byteLength(content) })) }) : json({ message: 'Not Found' }, 404);
    }
    if (path.startsWith('/contents/')) {
      const filePath = path.slice('/contents/'.length);
      if (method === 'GET') {
        const ref = url.searchParams.get('ref');
        const files = snapshots.get(branches.get(ref) || ref);
        const file = files?.get(filePath);
        return file ? json({ type: 'file', sha: file.sha, encoding: 'base64', content: Buffer.from(file.content).toString('base64') }) : json({ message: 'Not Found' }, 404);
      }
      if (method === 'PUT') {
        if (body.branch === state.info.default_branch) throw new Error('TEST SAFETY: attempted default-branch write');
        const parent = branches.get(body.branch);
        if (!parent) return json({ message: 'Missing branch' }, 404);
        const files = new Map(snapshots.get(parent));
        const current = files.get(filePath);
        if (current && body.sha !== current.sha || !current && body.sha) return json({ message: 'Conflict' }, 409);
        const content = Buffer.from(body.content, 'base64').toString('utf8');
        const sha = (++commitCounter).toString(16).padStart(40, '0');
        files.set(filePath, { path: filePath, sha: blobSha(content), content, type: 'blob', mode: '100644' });
        snapshots.set(sha, files); branches.set(body.branch, sha);
        return json({ content: { path: filePath, sha: blobSha(content) }, commit: { sha, html_url: `https://github.com/example/project/commit/${sha}`, parents: [{ sha: parent }] } }, current ? 200 : 201);
      }
    }
    if (path === '/pulls' && method === 'POST') {
      const number = pulls.size + 1;
      const pull = { number, html_url: `https://github.com/example/project/pull/${number}`, state: 'open', merged: false, base: { ref: body.base, repo: { full_name: 'example/project' } }, head: { repo: { full_name: 'example/project' }, ref: body.head, sha: branches.get(body.head) } };
      pulls.set(number, pull); return json(pull, 201);
    }
    if (/^\/pulls\/\d+$/.test(path)) return pulls.has(Number(path.split('/').at(-1))) ? json(pulls.get(Number(path.split('/').at(-1)))) : json({ message: 'Not Found' }, 404);
    if (path.startsWith('/rules/branches/')) return json([]);
    if (path.includes('/protection/required_status_checks')) return json({ contexts: ['validate'], checks: [{ context: 'validate', app_id: 15368 }] });
    if (path.endsWith('/check-runs')) return json({ check_runs: [{ id: 1, head_sha: path.split('/')[2], name: 'validate', app: { id: 15368 }, status: 'completed', conclusion: 'success', started_at: '2026-10-31T00:00:00Z' }] });
    if (path.endsWith('/statuses')) return json([]);
    throw new Error(`Unexpected mock GitHub request: ${method} ${path}`);
  };
  return state;
}
