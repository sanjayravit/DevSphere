const HIGH_RISK_PATH = /(^|\/)(\.github|\.gitlab|auth|security|middleware|firebase|config|deploy|deployment|payments?)(\/|\.|$)|(^|\/)(package\.json|vercel\.json|Dockerfile|server\.js|index\.js)$/i;
const HIGH_RISK_CONTENT = /\b(execSync|spawnSync|eval|child_process|shell:\s*true|chmod\s+777)\b/;

export function analyzeSystem({ plan, changes = [], qa, errorRate }) {
  const suggestions = [];
  if (Number.isFinite(errorRate) && errorRate > 20) suggestions.push('Review error boundaries and retry behavior before broad refactoring.');
  if (changes.length > 5) suggestions.push('Consider splitting this proposal into smaller pull requests.');
  if (qa?.status !== 'passed') suggestions.push('Do not execute until static QA is passing; run the repository test/build checks on the proposed branch.');
  if (!changes.length) suggestions.push('No file changes were generated; treat this as an advisory response.');
  const sensitive = changes.some(change => HIGH_RISK_PATH.test(change.path) || HIGH_RISK_CONTENT.test(change.content));
  const impact = changes.length > 5 || changes.some(change => /(^|\/)(\.github|\.gitlab|package\.json|vercel\.json|Dockerfile|server\.js|index\.js)(\/|$)/i.test(change.path)) ? 'system' : changes.length > 1 ? 'module' : 'file';
  const risk = sensitive ? 'high' : changes.length > 3 || plan.risk === 'medium' ? 'medium' : (plan.risk === 'high' ? 'high' : 'low');
  const confidence = Math.max(0, Math.min(100, Math.round(plan.confidence - (changes.length > 5 ? 10 : 0) - (qa?.status === 'inconclusive' ? 15 : 0) - (qa?.status === 'failed' ? 40 : 0))));
  return { suggestions, risk, impact, confidence, issue: plan.issue, suggestedFix: plan.suggestedFix };
}
