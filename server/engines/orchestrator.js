import { randomUUID } from 'node:crypto';
import { processIntent } from './intentEngine.js';
import { plannerAgent } from '../agents/plannerAgent.js';
import { devAgent } from '../agents/devAgent.js';
import { qaAgent } from '../agents/qaAgent.js';
import { analyzeSystem } from './designEngine.js';
import { evaluateDecision, EXECUTION_MODES } from './decisionEngine.js';
import { createUniqueBranch, commitChanges, createPullRequest } from '../services/githubService.js';
import { appendRunEvent, createRun, updateRun, releaseRun } from '../services/firebaseService.js';
import { boundedInteger, proposalHash, redact, safeMessage } from '../utils/security.js';
import { validateChanges } from '../utils/repositorySafety.js';
export { proposalHash } from '../utils/security.js';

async function progress(context, step, status, detail = {}) {
  const event = { runId: context.runId, requestId: context.requestId, step, status, detail, at: new Date().toISOString() };
  const stored = await context.appendRunEvent(context.runId, context.userId, event);
  // A socket outage must not undo an already persisted GitHub execution.
  try { context.emit?.(stored || redact(event)); } catch { /* history is the source of truth */ }
}
async function recordFailure(context, error) {
  const message = safeMessage(error);
  await context.updateRun(context.runId, context.userId, { status: 'failed', error: message, errorCode: error.code || 'RUN_FAILED' }).catch(() => null);
  await progress(context, 'orchestrator', 'failed', { message }).catch(() => null);
  error.runId = context.runId;
}
async function executeChanges(context, proposal) {
  validateChanges(proposal.changes);
  if (!proposal.baseSha) throw new Error('The proposal has no immutable repository snapshot; regenerate it.');
  await progress(context, 'github-branch', 'running', { message: 'Creating an isolated feature branch from the exact proposed default-branch snapshot.' });
  let branch;
  try { branch = await context.createUniqueBranch(proposal.repository, proposal.defaultBranch, proposal.baseSha, { signal: context.signal }); }
  catch (error) {
    if (error.branch) await context.updateRun(context.runId, context.userId, { branch: error.branch.branch, baseBranch: error.branch.base, branchUrl: error.branch.url, baseSha: error.branch.baseSha, executionState: 'unknown', executionError: safeMessage(error) });
    throw error;
  }
  await context.updateRun(context.runId, context.userId, { branch: branch.branch, baseBranch: branch.base, branchUrl: branch.url, baseSha: branch.baseSha });
  await progress(context, 'github-branch', 'completed', { branch: branch.branch });
  await progress(context, 'github-commit', 'running', { branch: branch.branch });
  let committed;
  try {
    committed = await context.commitChanges(proposal.repository, branch.branch, proposal.changes, undefined, { expectedHeadSha: branch.baseSha, signal: context.signal });
  } catch (error) {
    if (error.partialCommit) await context.updateRun(context.runId, context.userId, { commitSha: error.partialCommit.sha, commitUrl: error.partialCommit.html_url, partialCommitPaths: error.partialPaths || [], executionError: safeMessage(error) });
    throw error;
  }
  await context.updateRun(context.runId, context.userId, { commitSha: committed.commitSha, commitUrl: committed.commitUrl, branchUrl: committed.branchUrl });
  await progress(context, 'github-commit', 'completed', { commitUrl: committed.commitUrl });
  await progress(context, 'github-pr', 'running');
  const pr = await context.createPullRequest(proposal.repository, branch.branch, branch.base, {
    title: `DevSphere V2: ${proposal.intent.summary.slice(0, 160)}`,
    body: `## DevSphere V2 proposal\n\n${proposal.intent.summary}\n\n**Decision:** ${proposal.decision.decision} — ${proposal.decision.reason}\n**Confidence:** ${proposal.confidence}%\n**Risk / impact:** ${proposal.risk} / ${proposal.impact}\n**QA:** ${proposal.qa.status} (static only; target repository tests have not run)\n\nReview this PR and required CI before merging.`,
    expectedHeadSha: committed.commitSha, expectedBaseSha: branch.baseSha, signal: context.signal
  });
  const urls = { branch: branch.branch, branchUrl: branch.url, commitUrl: committed.commitUrl, pullRequest: pr.url, pullNumber: pr.number, commitSha: committed.commitSha };
  await context.updateRun(context.runId, context.userId, { status: 'pull_request', ...urls, executionError: null });
  await progress(context, 'github-pr', 'completed', urls);
  return urls;
}
const defaults = { processIntent, plannerAgent, devAgent, qaAgent, analyzeSystem, evaluateDecision, createUniqueBranch, commitChanges, createPullRequest, appendRunEvent, createRun, updateRun, releaseRun };
function executionContext(dependencies, { runId, userId, emit, requestId }) {
  return { ...dependencies, runId, userId, emit, requestId, signal: AbortSignal.timeout(boundedInteger(process.env.RUN_TIMEOUT_MS, 180_000, 5_000, 240_000)) };
}
export function createRunDevSphere(overrides = {}) {
  const dependencies = { ...defaults, ...overrides };
  return async function runDevSphere({ input, mode, userId, emit, requestId }) {
    if (!EXECUTION_MODES.includes(mode) || typeof input !== 'string' || input.trim().length < 8 || input.length > 12_000 || !userId) throw new TypeError('A valid user, intent and execution mode are required.');
    const runId = randomUUID();
    const owner = String(userId);
    const context = executionContext(dependencies, { runId, userId: owner, emit, requestId });
    await dependencies.createRun(runId, { userId: owner, input, mode, requestId, status: 'running', approval: 'not-required', proposal: null });
    const usage = [];
    const options = { signal: context.signal, onUsage: async item => { usage.push(item); await dependencies.updateRun(runId, owner, { usage }); } };
    try {
      await progress(context, 'intent', 'running');
      const intent = await dependencies.processIntent(input, options);
      await dependencies.updateRun(runId, owner, { intent });
      await progress(context, 'intent', 'completed', { summary: intent.summary });
      await progress(context, 'planner', 'running');
      const plan = await dependencies.plannerAgent(intent, options);
      await dependencies.updateRun(runId, owner, { plan });
      await progress(context, 'planner', 'completed', { taskCount: plan.tasks.length });
      await progress(context, 'developer', 'running');
      const output = await dependencies.devAgent({ repo: process.env.GITHUB_REPOSITORY, intent, plan }, options);
      validateChanges(output.changes);
      await progress(context, 'developer', 'completed', { changeCount: output.changes.length, repository: output.repository });
      await progress(context, 'qa', 'running');
      const qa = await dependencies.qaAgent(output);
      await dependencies.updateRun(runId, owner, { qa });
      await progress(context, 'qa', qa.status, { summary: qa.summary, checkCount: qa.checks.length });
      await progress(context, 'design', 'running');
      const design = dependencies.analyzeSystem({ plan, changes: output.changes, qa });
      await progress(context, 'design', 'completed', { suggestions: design.suggestions });
      const decision = dependencies.evaluateDecision({ confidence: design.confidence, risk: design.risk, impact: design.impact, mode, qa });
      // Hash the EXACT persisted execution envelope, not only its file contents.
      const proposal = redact({ issue: design.issue, suggestedFix: design.suggestedFix, confidence: design.confidence, risk: design.risk, impact: design.impact, mode, decision, changes: output.changes, qa, design, intent: { summary: intent.summary }, repository: output.repository, defaultBranch: output.defaultBranch, baseSha: output.baseSha });
      const pending = decision.decision === 'ask';
      const approvalHash = pending ? proposalHash(proposal) : null;
      const status = pending ? 'pending_approval' : decision.decision === 'auto' ? 'executing' : decision.decision === 'block' ? 'blocked' : 'suggested';
      await dependencies.updateRun(runId, owner, { status, decision, proposal, approvalHash, approval: pending ? 'pending' : 'not-required' });
      await progress(context, 'decision', 'completed', { ...decision, approvalRequired: pending });
      if (decision.decision === 'auto') {
        const urls = await executeChanges(context, proposal);
        return { runId, status: 'pull_request', intent, plan, proposal, qa, decision, ...urls };
      }
      return { runId, status, intent, plan, proposal, qa, decision, approvalHash };
    } catch (error) {
      await recordFailure(context, error);
      throw error;
    } finally { await dependencies.releaseRun(runId, owner).catch(() => null); }
  };
}
export const runDevSphere = createRunDevSphere();
export function createExecuteApprovedRun(overrides = {}) {
  const dependencies = { ...defaults, ...overrides };
  return async function executeApprovedRun({ run, userId, emit }) {
    if (run.userId !== String(userId)) throw new Error('This run does not belong to this user.');
    const context = executionContext(dependencies, { runId: run.id, userId: String(userId), emit, requestId: run.requestId });
    const proposal = run.proposal;
    try {
    if (run.status !== 'executing' || run.approval !== 'approved' || run.approvalRecord?.userId !== String(userId) || !proposal || run.approvalHash !== proposalHash(proposal) || run.approvalRecord.approvalHash !== run.approvalHash || run.decision?.decision !== 'ask' || run.qa?.status !== 'passed' || proposal.qa?.status !== 'passed') throw new Error('This exact proposal is not eligible for approval execution.');
    const policy = dependencies.evaluateDecision({ confidence: proposal.confidence, risk: proposal.risk, impact: proposal.impact, mode: proposal.mode, qa: proposal.qa });
    if (policy.decision !== 'ask' || proposal.decision.decision !== policy.decision) throw new Error('Server policy no longer permits approval execution.');
    return { runId: run.id, status: 'pull_request', ...await executeChanges(context, proposal) };
    } catch (error) {
      if (run.status === 'executing' && run.approval === 'approved') await recordFailure(context, error);
      throw error;
    } finally {
      if (run.status === 'executing' && run.approval === 'approved') await dependencies.releaseRun(run.id, String(userId)).catch(() => null);
    }
  };
}
export const executeApprovedRun = createExecuteApprovedRun();
