export const EXECUTION_MODES = Object.freeze(['manual', 'approval', 'assisted', 'full-auto']);
export const RISK_LEVELS = Object.freeze(['low', 'medium', 'high']);
export const IMPACT_SCOPES = Object.freeze(['file', 'module', 'system']);

export function evaluateDecision({ confidence, risk, impact = 'file', mode, qa }) {
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 100) throw new TypeError('confidence must be between 0 and 100');
  if (!RISK_LEVELS.includes(risk)) throw new TypeError('risk must be low, medium, or high');
  if (!IMPACT_SCOPES.includes(impact)) throw new TypeError('impact must be file, module, or system');
  if (!EXECUTION_MODES.includes(mode)) throw new TypeError('mode is invalid');

  const qaPassed = qa?.status === 'passed';
  const qaFailed = qa?.status === 'failed';
  let decision;
  let reason;
  if (qaFailed) {
    decision = 'block'; reason = 'QA found a blocking issue; execution is prohibited.';
  } else if (!qaPassed) {
    decision = 'suggest'; reason = 'QA has not passed; execution is not permitted.';
  } else if (mode === 'manual') {
    decision = 'suggest'; reason = 'Manual mode never executes changes.';
  } else if (risk === 'high' && confidence < 40) {
    decision = 'block'; reason = 'Low-confidence high-risk changes are blocked in every execution mode.';
  } else if (impact === 'system') {
    decision = confidence < 40 ? 'block' : 'ask'; reason = confidence < 40 ? 'Low-confidence system-wide changes are blocked.' : 'System-wide changes always require explicit approval.';
  } else if (mode === 'approval') {
    decision = 'ask'; reason = 'Approval mode requires explicit approval for every change.';
  } else if (risk === 'high') {
    decision = confidence < 40 ? 'block' : 'ask';
    reason = confidence < 40 ? 'Low-confidence high-risk changes are blocked.' : 'High-risk changes always require explicit approval.';
  } else if (mode === 'assisted') {
    if (risk === 'low' && confidence > 80) {
      decision = 'auto'; reason = 'Low-risk change exceeds the assisted confidence threshold.';
    } else if (risk === 'low') {
      decision = 'suggest'; reason = 'Low-risk change did not exceed the assisted confidence threshold.';
    } else {
      decision = 'ask'; reason = 'Medium-risk or high-risk change requires explicit approval.';
    }
  } else if (mode === 'full-auto') {
    if (risk === 'low' && confidence >= 70) {
      decision = 'auto'; reason = 'Change is allowed by full-auto policy and risk gates.';
    } else if (risk === 'low') {
      decision = 'suggest'; reason = 'Low-risk change did not meet the full-auto confidence gate.';
    } else if (risk === 'medium') {
      decision = 'ask'; reason = 'Medium-risk changes remain behind explicit approval.';
    } else {
      decision = 'ask'; reason = 'Full auto never bypasses the high-risk approval gate.';
    }
  } else {
    decision = 'suggest'; reason = 'No execution policy matched.';
  }
  return { decision, reason, confidence, risk, impact, mode, qaStatus: qa?.status || 'not-run' };
}
