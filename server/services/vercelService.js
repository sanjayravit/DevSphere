import { boundedInteger, ServiceError } from '../utils/security.js';

const teamQuery = () => process.env.VERCEL_TEAM_ID ? `?teamId=${encodeURIComponent(process.env.VERCEL_TEAM_ID)}` : '';
export async function vercelRequest(path, { method = 'GET', body, signal } = {}) {
  if (!process.env.VERCEL_API_TOKEN) throw new ServiceError('VERCEL_API_TOKEN is not configured.', { status: 503, code: 'CONFIGURATION_ERROR' });
  let response;
  const timeout = AbortSignal.timeout(boundedInteger(process.env.VERCEL_TIMEOUT_MS, 15_000, 1_000, 30_000));
  try {
    response = await fetch(`https://api.vercel.com${path}${teamQuery()}`, {
      method, headers: { Authorization: `Bearer ${process.env.VERCEL_API_TOKEN}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout
    });
  } catch { throw new ServiceError('Vercel request timed out or could not reach the service. Verify the provider before retrying a deployment.', { code: 'VERCEL_NETWORK_ERROR', ambiguous: method === 'POST' }); }
  if (!response.ok) throw new ServiceError(`Vercel API request failed (${response.status}).`, { status: response.status === 429 ? 429 : 502, code: 'VERCEL_ERROR', ambiguous: method === 'POST' && response.status >= 500 });
  try { return await response.json(); }
  catch { throw new ServiceError('Vercel returned malformed JSON.', { code: 'VERCEL_INVALID_RESPONSE', ambiguous: method === 'POST' }); }
}
function outcome(deployment, checks) {
  if (!deployment || typeof deployment.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(deployment.id) || !['QUEUED', 'INITIALIZING', 'BUILDING', 'READY', 'ERROR', 'CANCELED'].includes(deployment.readyState)) throw new ServiceError('Vercel returned an invalid deployment record; verify the provider before retrying.', { code: 'VERCEL_INVALID_RESPONSE', ambiguous: true });
  const base = { deploymentId: deployment.id, checks, providerState: deployment.readyState };
  if (deployment.readyState === 'READY') {
    if (typeof deployment.url !== 'string' || !/^[a-zA-Z0-9.-]+(?:\.vercel\.app)$/.test(deployment.url)) throw new ServiceError('Vercel returned no verifiable deployment URL.', { code: 'VERCEL_INVALID_RESPONSE', ambiguous: true });
    return { ...base, status: 'deployed', url: `https://${deployment.url}` };
  }
  if (['ERROR', 'CANCELED'].includes(deployment.readyState)) return { ...base, status: 'failed', reason: `Vercel deployment finished with state ${deployment.readyState}.` };
  return { ...base, status: 'pending', reason: 'Deployment is still running; refresh its provider status. It has not succeeded yet.' };
}
export async function startDeployment({ info, sha, checks, signal }) {
  const deployment = await vercelRequest('/v13/deployments', { method: 'POST', signal, body: {
    name: process.env.VERCEL_PROJECT_NAME || info.name, project: process.env.VERCEL_PROJECT_ID, target: 'production',
    gitSource: { type: 'github', repoId: process.env.VERCEL_GITHUB_REPO_ID, ref: info.defaultBranch, sha }
  } });
  if (deployment?.projectId !== process.env.VERCEL_PROJECT_ID) throw new ServiceError('Vercel creation returned a deployment outside the configured project; manual reconciliation is required.', { code: 'VERCEL_INVALID_RESPONSE', ambiguous: true });
  return outcome(deployment, checks);
}
export async function getDeploymentOutcome(deploymentId, checks, options = {}) {
  const deployment = await vercelRequest(`/v13/deployments/${encodeURIComponent(deploymentId)}`, options);
  if (deployment.id !== deploymentId || deployment.projectId !== process.env.VERCEL_PROJECT_ID) throw new ServiceError('Vercel deployment does not belong to the configured project.', { code: 'VERCEL_INVALID_RESPONSE' });
  return outcome(deployment, checks);
}
export async function getDeploymentLogs(deploymentId) {
  if (typeof deploymentId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(deploymentId)) throw new Error('Invalid deployment ID.');
  const events = await vercelRequest(`/v2/deployments/${encodeURIComponent(deploymentId)}/events`);
  if (!Array.isArray(events)) throw new ServiceError('Vercel returned invalid deployment logs.', { code: 'VERCEL_INVALID_RESPONSE' });
  const logs = events.filter(event => event.type === 'error' || event.message?.toLowerCase().includes('error'));
  return (logs.length ? logs : events.slice(-10)).map(event => event.message || event.text || '').join('\n').slice(0, 20_000);
}
export default { getDeploymentLogs, startDeployment, getDeploymentOutcome };
