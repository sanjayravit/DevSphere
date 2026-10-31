import { getPullRequest, getRepositoryInfo, getRequiredChecks } from '../services/githubService.js';

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export async function deployAgent({ repo, pullNumber }) {
  const pull = await getPullRequest(repo, pullNumber);
  const info = await getRepositoryInfo(repo);
  if (!pull.merged) return { status: 'skipped', reason: 'Production deployment requires a verified merged pull request.' };
  if (pull.base?.ref !== info.defaultBranch) return { status: 'skipped', reason: 'Merged pull request target does not match the current default branch.' };
  const checks = await getRequiredChecks(repo, pull.merge_commit_sha, info.defaultBranch);
  if (!checks.configured || !checks.passed) return { status: 'skipped', reason: checks.reason || 'Required checks are not all successful.', checks };
  const token = process.env.VERCEL_API_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const gitRepoId = process.env.VERCEL_GITHUB_REPO_ID;
  if (!token || !projectId || !gitRepoId) return { status: 'skipped', reason: 'Vercel token, project ID, or linked GitHub repository ID is not configured.', checks };

  const response = await fetch(`https://api.vercel.com/v13/deployments${process.env.VERCEL_TEAM_ID ? `?teamId=${encodeURIComponent(process.env.VERCEL_TEAM_ID)}` : ''}`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: process.env.VERCEL_PROJECT_NAME || info.name, project: projectId, target: 'production', gitSource: { type: 'github', repoId: gitRepoId, ref: info.defaultBranch, sha: pull.merge_commit_sha } })
  });
  const deployment = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Vercel API ${response.status}: ${deployment.error?.message || 'Deployment request failed.'}`);
  const timeoutAt = Date.now() + 120_000;
  let state = deployment.readyState || 'QUEUED';
  while (!['READY', 'ERROR', 'CANCELED'].includes(state) && Date.now() < timeoutAt) {
    await wait(3_000);
    const statusResponse = await fetch(`https://api.vercel.com/v13/deployments/${encodeURIComponent(deployment.id)}${process.env.VERCEL_TEAM_ID ? `?teamId=${encodeURIComponent(process.env.VERCEL_TEAM_ID)}` : ''}`, { headers: { Authorization: `Bearer ${token}` } });
    const current = await statusResponse.json().catch(() => ({}));
    if (!statusResponse.ok) throw new Error(`Vercel deployment status check failed (${statusResponse.status}).`);
    state = current.readyState || state;
    if (state === 'READY') return { status: 'deployed', url: current.url ? `https://${current.url}` : null, deploymentId: deployment.id, checks };
    if (['ERROR', 'CANCELED'].includes(state)) return { status: 'failed', reason: `Vercel deployment finished with state ${state}.`, deploymentId: deployment.id, checks };
  }
  return { status: 'pending', reason: 'Deployment is still running; verify the provider status before reporting success.', deploymentId: deployment.id, checks };
}
