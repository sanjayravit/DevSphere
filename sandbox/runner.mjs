// Dedicated runner HOST only. Never import this into Express or deploy it with
// production credentials. Requires rootless Docker + gVisor runsc; no fallback.
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createHash, timingSafeEqual } from 'node:crypto';
import { COMMANDS, LIMITS, commandPolicy } from '../server/services/qa/policy.js';
const image = process.env.QA_SANDBOX_IMAGE;
const token = process.env.QA_RUNNER_TOKEN;
if (!/^.+@sha256:[a-f0-9]{64}$/.test(image || '') || !token || token.length < 32) throw new Error('Pinned image digest and strong runner token required.');
const jobs = new Map();
const cliEnv = { PATH: process.env.PATH, HOME: process.env.HOME, XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR, DOCKER_HOST: process.env.DOCKER_HOST };
function docker(args, { input, signal, capture = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, { env: cliEnv, stdio: ['pipe', 'pipe', 'pipe'], signal });
    let bytes = 0; let output = '';
    for (const stream of [child.stdout, child.stderr]) stream.on('data', data => { bytes += data.length; if (capture && output.length < LIMITS.outputBytes) output += data.toString().slice(0, LIMITS.outputBytes - output.length); });
    child.on('error', reject); child.stdin.on('error', () => {});
    child.on('close', code => resolve({ exitCode: code ?? -1, outputBytes: Math.min(bytes, LIMITS.outputBytes), output }));
    child.stdin.end(input);
  });
}
const info = await docker(['info', '--format', '{{json .SecurityOptions}}'], { capture: true, signal: AbortSignal.timeout(5000) });
if (info.exitCode || !info.output.includes('rootless')) throw new Error('Rootless Docker is mandatory.');
const remove = async id => {
  const result = await docker(['rm', '--force', `devsphere-qa-${id}`], { capture: true, signal: AbortSignal.timeout(5000) });
  if (result.exitCode && !result.output.includes('No such container')) throw new Error('Cleanup unconfirmed.');
};
async function run(job, controller) {
  const commands = commandPolicy(job.files, job.commands?.map(c => c.id));
  if (JSON.stringify(commands) !== JSON.stringify(job.commands) || job.inputHash !== createHash('sha256').update(JSON.stringify({ files: job.files, commands })).digest('hex')) throw new Error('Invalid job binding.');
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(LIMITS.timeoutMs)]);
  const name = `devsphere-qa-${job.id}`;
  const report = { id: job.id, inputHash: job.inputHash, state: 'incomplete', commands: [] };
  try {
    const start = await docker(['run', '--detach', '--pull=never', '--name', name, '--runtime=runsc', '--network=none', '--read-only', '--user=65532:65532', '--cap-drop=ALL', '--security-opt=no-new-privileges', '--pids-limit=64', '--cpus=1', '--memory=512m', '--memory-swap=512m', '--ulimit=nofile=256:256', '--ulimit=core=0:0', '--tmpfs=/workspace:rw,nosuid,nodev,size=224m,uid=65532,gid=65532', '--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=32m,uid=65532,gid=65532', '--workdir=/workspace', '--env=HOME=/tmp', '--env=npm_config_cache=/opt/npm-cache', '--env=CI=true', '--log-driver=none', '--label=devsphere.qa=true', image, 'node', '-e', 'setInterval(()=>{},1000)'], { signal });
    if (start.exitCode) { report.state = 'runner_unavailable'; return report; }
    const loaded = await docker(['exec', '-i', name, 'node', '/opt/qa/load.mjs'], { input: JSON.stringify(job.files), signal });
    if (loaded.exitCode) { report.state = 'resource_limit'; report.resource = 'disk'; return report; }
    for (const command of commands) {
      const at = Date.now();
      const result = await docker(['exec', name, ...COMMANDS[command.id]], { signal, capture: true });
      report.commands.push({ id: command.id, exitCode: result.exitCode, durationMs: Date.now() - at, outputBytes: result.outputBytes });
      if (result.exitCode) {
        const disk = /ENOSPC|No space left on device/.test(result.output);
        const processes = /EAGAIN|Resource temporarily unavailable/.test(result.output);
        report.state = result.exitCode === 137 || disk || processes ? 'resource_limit' : command.id === 'install' ? 'missing_dependencies' : 'failed';
        if (report.state === 'resource_limit') report.resource = disk ? 'disk' : processes ? 'process' : 'unknown';
        return report;
      }
    }
    report.state = 'passed'; return report;
  } catch {
    report.state = controller.signal.aborted ? 'cancelled' : signal.aborted ? 'timeout' : 'runner_unavailable'; return report;
  } finally { await remove(job.id); }
}
http.createServer(async (req, res) => {
  const reply = (code, data) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
  const supplied = Buffer.from(req.headers.authorization || ''); const expected = Buffer.from(`Bearer ${token}`);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return reply(401, { error: 'Unauthorized' });
  const id = req.url?.match(/^\/jobs\/([a-f0-9-]{36})$/)?.[1];
  if (!id) return reply(404, {});
  if (req.method === 'DELETE') {
    const current = jobs.get(id); current?.controller?.abort();
    jobs.set(id, { ...current, cancelled: true, at: Date.now() });
    try { if (current?.promise) await current.promise.catch(() => {}); await remove(id); return reply(200, { cleaned: true }); }
    catch { return reply(503, { cleaned: false }); }
  }
  if (req.method !== 'POST') return reply(405, {});
  // Bound tombstones and prevent late POST after a cancellation.
  for (const [key, job] of jobs) if (!job.promise && job.at < Date.now() - 300_000) jobs.delete(key);
  if (jobs.has(id) || [...jobs.values()].some(j => j.active) || jobs.size > 1000) return reply(409, {});
  const entry = { active: true, controller: new AbortController(), at: Date.now() }; jobs.set(id, entry);
  req.setTimeout(5000, () => req.destroy());
  try {
    let body = ''; for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 2_100_000) throw new Error('Oversized job'); }
    req.setTimeout(0);
    const job = JSON.parse(body); if (job.id !== id || jobs.get(id)?.cancelled) throw new Error('Invalid job');
    // Reserve before awaiting execution. Aborted clients also destroy the sandbox.
    res.on('close', () => { if (!res.writableEnded) entry.controller.abort(); });
    entry.promise = run(job, entry.controller);
    reply(200, await entry.promise);
  } catch { reply(503, { error: 'Job incomplete; cleanup must be verified.' }); }
  finally { jobs.set(id, { at: Date.now(), cancelled: true }); }
}).listen(Number(process.env.QA_RUNNER_PORT || 8081), '0.0.0.0');
