import { boundedInteger } from '../utils/security.js';
import { getPullRequest, getRepositoryInfo, getRequiredChecks, getBranchHead } from '../services/githubService.js';
import { startDeployment, getDeploymentOutcome } from '../services/vercelService.js';

export function createDeployAgent(overrides = {}) {
  const providers = { getPullRequest, getRepositoryInfo, getRequiredChecks, getBranchHead, startDeployment, getDeploymentOutcome, ...overrides };
  return async function deployAgent({ repo, pullNumber, commitSha, deployment }) {
    const signal = AbortSignal.timeout(boundedInteger(process.env.DEPLOYMENT_TIMEOUT_MS, 60_000, 5_000, 120_000));
    if (deployment?.deploymentId) return providers.getDeploymentOutcome(deployment.deploymentId, deployment.checks, { signal });
    const pull = await providers.getPullRequest(repo, pullNumber, { signal });
    const info = await providers.getRepositoryInfo(repo, { signal });
    const skip = (reason, checks) => ({ status: 'skipped', reason, ...(checks ? { checks } : {}) });
    if (!pull.merged || !pull.merged_at || !pull.merge_commit_sha) return skip('Production deployment requires a verified merged pull request.');
    if (pull.base?.ref !== info.defaultBranch || pull.base?.repo?.full_name?.toLowerCase() !== info.fullName.toLowerCase()) return skip('The merged PR does not target this repository’s current default branch.');
    if (!commitSha || pull.head?.sha !== commitSha) return skip('The merged PR head does not match the commit delivered by this run.');
    if (await providers.getBranchHead(repo, info.defaultBranch, { signal }) !== pull.merge_commit_sha) return skip('The default branch has advanced beyond this merged PR; refusing to deploy an obsolete revision.');
    const checks = await providers.getRequiredChecks(repo, pull.merge_commit_sha, info.defaultBranch, { signal });
    if (!checks.configured || !checks.passed) return skip(checks.reason || 'Required checks on the merged default-branch commit are not all successful.', checks);
    if (!process.env.VERCEL_API_TOKEN || !process.env.VERCEL_PROJECT_ID || !process.env.VERCEL_GITHUB_REPO_ID) return skip('Vercel token, project ID, or linked GitHub repository ID is not configured.', checks);
    if (String(info.id) !== process.env.VERCEL_GITHUB_REPO_ID) return skip('Vercel linked repository ID does not match the verified GitHub repository.', checks);
    if (process.env.ENABLE_PRODUCTION_DEPLOYMENTS !== 'true') return skip('Production deployment is disabled. The repository owner must explicitly enable ENABLE_PRODUCTION_DEPLOYMENTS.', checks);
    // A single bounded request, never a long serverless polling loop. Pending
    // deployments are refreshed by ID without creating another deployment.
    return providers.startDeployment({ info, sha: pull.merge_commit_sha, checks, signal });
  };
}
export const deployAgent = createDeployAgent();
