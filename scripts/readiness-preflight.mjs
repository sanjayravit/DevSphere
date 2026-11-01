import { assertProductionConfiguration } from '../server/services/providerTelemetry.js';
const blockers = assertProductionConfiguration({ ...process.env, NODE_ENV: 'production' });
for (const name of ['FIREBASE_PROJECT_ID', 'GITHUB_REPOSITORY', 'GITHUB_TOKEN', 'OPENAI_API_KEY']) if (!process.env[name]) blockers.push(`${name} is not configured.`);
if (process.env.QA_EXECUTION_ENABLED !== 'true') blockers.push('Sandbox execution is disabled; mandatory QA remains inconclusive.');
else {
  if (!process.env.QA_RUNNER_TOKEN) blockers.push('QA_RUNNER_TOKEN is missing.');
  try { const u = new URL(process.env.QA_RUNNER_URL); if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash) throw new Error(); } catch { blockers.push('QA_RUNNER_URL must be a private HTTPS endpoint.'); }
}
console.log(JSON.stringify({ mode: 'configuration-only; zero provider calls', productionCertified: false, blockers, operatorVerification: ['Sandbox hostile-code probes', 'Hosted Firebase IAM/rules/indexes and backup restore', 'Live providers and Redis/socket hosting', 'GitHub protection/rules and Vercel independent auto-deployment settings', 'Ingress quotas, HTTPS, monitoring and retention'] }, null, 2));
if (blockers.length) process.exitCode = 1;
