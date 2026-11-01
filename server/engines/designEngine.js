const HIGH_RISK_PATH = /(^|\/)(?:[^/]*(?:auth|security|permission|session|token|credential|payments?|deploy|config|firebase|middleware|migrations?|database)[^/]*)(\/|$)|(^|\/)(\.github|\.gitlab|scripts)(\/|$)|(^|\/)(package\.json|Dockerfile|server\.[cm]?js|index\.[cm]?js)$/i;
const HIGH_RISK_CONTENT = /\b(execSync|execFile|spawn|eval|child_process|verifyIdToken|signSession|jsonwebtoken|chmod)\b|shell\s*:\s*true|Authorization|req\.user/;

export function analyzeSystem({ plan, changes = [], qa, errorRate }) {
  const suggestions = [];
  if (Number.isFinite(errorRate) && errorRate > 20) suggestions.push('Review error boundaries and retry behavior before broad refactoring.');
  if (changes.length > 5) suggestions.push('Consider splitting this proposal into smaller pull requests.');
  if (qa?.status !== 'passed') suggestions.push('Do not execute until static QA is passing; run the repository test/build checks on the proposed branch.');
  if (!changes.length) suggestions.push('No file changes were generated; treat this as an advisory response.');
  const sensitive = changes.some(change => HIGH_RISK_PATH.test(change.path) || HIGH_RISK_CONTENT.test(change.content));
  const detectedImpact = changes.length > 5 || changes.some(change => /(^|\/)(\.github|\.gitlab|package\.json|vercel\.json|Dockerfile|server\.js|index\.js|firestore\.rules|firebase\.json)(\/|$)/i.test(change.path)) ? 'system' : changes.length > 1 ? 'module' : 'file';
  const risk = sensitive || plan.risk === 'high' || plan.impact === 'system' || detectedImpact === 'system' ? 'high' : changes.length > 3 || plan.risk === 'medium' ? 'medium' : 'low';
  const impacts = ['file', 'module', 'system'];
  const impact = impacts[Math.max(impacts.indexOf(detectedImpact), impacts.indexOf(plan.impact))];
  const confidence = Math.max(0, Math.min(100, Math.round(plan.confidence - (changes.length > 5 ? 10 : 0) - (qa?.status === 'inconclusive' ? 15 : 0) - (qa?.status === 'failed' ? 40 : 0))));
  return { suggestions, risk, impact, confidence, issue: plan.issue, suggestedFix: plan.suggestedFix };
}
