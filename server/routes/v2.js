import { withProviderScope } from '../services/providerTelemetry.js';
import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import { rateLimit } from '../middleware/rateLimit.js';
import auth, { requireRepositoryOperator } from '../middleware/auth.js';
import { runDevSphere, executeApprovedRun } from '../engines/orchestrator.js';
import { getPullRequestChecks } from '../services/githubService.js';
import { deployAgent } from '../agents/deployAgent.js';
import { requestRunCancellation, claimCheckRefresh, recordCheckRefresh, appendRunEvent, claimRunApproval, rejectRunApproval, claimRunDeployment, getRun, listRuns, updateRun } from '../services/firebaseService.js';
import { proposalHash, safeMessage } from '../utils/security.js';
import { emitRoomEvent } from '../sockets/socketHandler.js';
export { authenticateSocket } from '../sockets/authenticateSocket.js';

const makeEmitter = (req, userId) => event => {
  const room = `devsphere:user:${userId}`;
  if (req.app.get('io')) req.app.get('io').to(room).emit('devsphere:update', event);
  else emitRoomEvent(room, 'devsphere:update', event);
};
function respondError(res, error) {
  if (error.retryAfter) res.setHeader('Retry-After', String(error.retryAfter));
  return res.status(error.status && error.status >= 400 && error.status < 600 ? error.status : 502).json({ error: safeMessage(error), code: error.code, runId: error.runId });
}
const providerScope = (services, run, userId) => {
  const metrics = [...(run.providerMetrics || [])];
  return { userId, onMetric: async metric => { metrics.push(metric); await services.updateRun(run.id, userId, { providerMetrics: metrics.slice(-100) }); } };
};
const validHash = hash => typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash);
export function createV2Router(overrides = {}) {
  const services = { getPullRequestChecks, runDevSphere, executeApprovedRun, deployAgent, requestRunCancellation, claimCheckRefresh, recordCheckRefresh, appendRunEvent, claimRunApproval, rejectRunApproval, claimRunDeployment, getRun, listRuns, updateRun, ...overrides };
  const router = express.Router();
  router.use(auth, rateLimit({ limit: 120 }));
  router.param('runId', (req, res, next, runId) => /^[A-Za-z0-9_-]{1,128}$/.test(runId) ? next() : res.status(400).json({ error: 'Invalid run ID.' }));
  router.post('/run', requireRepositoryOperator, async (req, res) => {
    const { input, mode = 'assisted', requestId } = req.body || {};
    if (typeof input !== 'string' || input.trim().length < 8 || input.length > 12_000) return res.status(400).json({ error: 'Input must be between 8 and 12,000 characters.' });
    if (!['manual', 'approval', 'assisted', 'full-auto'].includes(mode)) return res.status(400).json({ error: 'Mode must be manual, approval, assisted, or full-auto.' });
    if (requestId !== undefined && (typeof requestId !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(requestId))) return res.status(400).json({ error: 'Invalid request ID.' });
    try { res.json(await services.runDevSphere({ input: input.trim(), mode, requestId, userId: req.user.id, emit: makeEmitter(req, req.user.id) })); }
    catch (error) { respondError(res, error); }
  });
  router.get('/runs', async (req, res) => {
    const limit = req.query.limit === undefined ? 25 : Number(req.query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) return res.status(400).json({ error: 'limit must be an integer from 1 to 50.' });
    try { res.json({ runs: await services.listRuns(req.user.id, limit) }); }
    catch (error) { respondError(res, error); }
  });
  router.get('/runs/:runId', async (req, res) => {
    try {
      const run = await services.getRun(req.params.runId, req.user.id);
      if (!run) return res.status(404).json({ error: 'Run not found.' });
      res.json({ run });
    } catch (error) { respondError(res, error); }
  });
  router.get('/runs/:runId/checks', async (req, res) => {
    try {
      const run = await services.getRun(req.params.runId, req.user.id);
      if (!run) return res.status(404).json({ error: 'Run not found.' });
      res.json({ ci: run.ci || { state: 'missing', passed: false } });
    } catch (error) { respondError(res, error); }
  });
  router.post('/runs/:runId/checks/refresh', requireRepositoryOperator, async (req, res) => {
    try {
      if (!await services.getRun(req.params.runId, req.user.id)) return res.status(404).json({ error: 'Run not found.' });
      const run = await services.claimCheckRefresh(req.params.runId, req.user.id);
      if (!run) return res.status(429).set('Retry-After', '60').json({ error: 'No tracked PR or refresh is limited to once per minute.' });
      const ci = await withProviderScope(providerScope(services, run, req.user.id), () => services.getPullRequestChecks(run.proposal.repository, run.pullNumber, run.commitSha, { signal: AbortSignal.timeout(30_000) }));
      const stored = await services.recordCheckRefresh(run.id, req.user.id, run.checkGeneration, ci);
      if (!stored) return res.status(409).json({ error: 'A newer refresh superseded this result.' });
      if (stored.event) { try { makeEmitter(req, req.user.id)(stored.event); } catch { /* persisted history is authoritative */ } }
      res.json({ ci: stored.ci });
    } catch (error) { respondError(res, error); }
  });
  router.post('/runs/:runId/cancel', requireRepositoryOperator, async (req, res) => {
    try {
      if (!await services.getRun(req.params.runId, req.user.id)) return res.status(404).json({ error: 'Run not found.' });
      const run = await services.requestRunCancellation(req.params.runId, req.user.id);
      if (!run) return res.status(409).json({ error: 'Only active runs can be cancelled. Use reject for pending approvals.' });
      res.status(202).json({ runId: run.id, status: 'cancellation_requested', message: 'Cancellation is cooperative. Inspect persisted provider outcomes; accepted writes cannot be rolled back.' });
    } catch (error) { respondError(res, error); }
  });
  router.post('/runs/:runId/approve', requireRepositoryOperator, async (req, res) => {
    const { approvalHash, approved = true } = req.body || {};
    if (approved !== true || !validHash(approvalHash)) return res.status(400).json({ error: 'Explicit approval and a valid approvalHash are required.' });
    try {
      const existing = await services.getRun(req.params.runId, req.user.id);
      if (!existing) return res.status(404).json({ error: 'Run not found.' });
      const currentHash = proposalHash(existing.proposal || {});
      if (!timingSafeEqual(Buffer.from(approvalHash, 'hex'), Buffer.from(currentHash, 'hex')) || currentHash !== existing.approvalHash) return res.status(409).json({ error: 'Approval hash does not match the exact current proposal.' });
      // Revalidate the hash, QA and state in the SAME transaction as the claim.
      const run = await services.claimRunApproval(req.params.runId, req.user.id, approvalHash);
      if (!run) return res.status(409).json({ error: 'Proposal is not eligible or has already been processed.' });
      const emit = makeEmitter(req, req.user.id);
      emit({ runId: run.id, step: 'approval', status: 'approved', at: new Date().toISOString() });
      res.json(await services.executeApprovedRun({ run, userId: req.user.id, emit }));
    } catch (error) { respondError(res, error); }
  });
  router.post('/runs/:runId/reject', requireRepositoryOperator, async (req, res) => {
    if (!validHash(req.body?.approvalHash)) return res.status(400).json({ error: 'A valid approvalHash is required.' });
    try {
      if (!await services.getRun(req.params.runId, req.user.id)) return res.status(404).json({ error: 'Run not found.' });
      const run = await services.rejectRunApproval(req.params.runId, req.user.id, req.body.approvalHash);
      if (!run) return res.status(409).json({ error: 'This exact proposal is no longer awaiting approval.' });
      makeEmitter(req, req.user.id)({ runId: run.id, step: 'approval', status: 'rejected', at: new Date().toISOString() });
      res.json({ run });
    } catch (error) { respondError(res, error); }
  });
  router.post('/runs/:runId/deploy', requireRepositoryOperator, async (req, res) => {
    let claimed;
    let providerOutcome;
    try {
      if (!await services.getRun(req.params.runId, req.user.id)) return res.status(404).json({ error: 'Run not found.' });
      claimed = await services.claimRunDeployment(req.params.runId, req.user.id);
      if (!claimed) return res.status(409).json({ error: 'A QA-passing, authorized PR is required and deployment must not already be in progress.' });
      const outcome = providerOutcome = await withProviderScope(providerScope(services, claimed, req.user.id), () => services.deployAgent({ repo: claimed.proposal.repository, pullNumber: claimed.pullNumber, commitSha: claimed.commitSha, deployment: claimed.status === 'deployment_pending' ? claimed.deployment : undefined }));
      const statuses = { deployed: 'deployed', failed: 'deployment_failed', pending: 'deployment_pending', skipped: 'deployment_skipped' };
      if (!statuses[outcome.status]) throw new Error('Invalid deployment outcome.');
      await services.updateRun(claimed.id, req.user.id, { deployment: outcome, status: statuses[outcome.status] });
      const event = await services.appendRunEvent(claimed.id, req.user.id, { step: 'deployment', status: outcome.status, detail: outcome });
      makeEmitter(req, req.user.id)(event);
      res.json({ deployment: outcome });
    } catch (error) {
      if (claimed) {
        // A persistence/event failure AFTER a provider outcome is not a failed
        // deployment. Likewise, a failed status read is not permission to create
        // another deployment: preserve the original ID and refresh it again.
        const outcome = providerOutcome && ['deployed', 'failed', 'pending', 'skipped'].includes(providerOutcome.status) ? providerOutcome
          : claimed.status === 'deployment_pending' && claimed.deployment?.deploymentId
            ? { ...claimed.deployment, status: 'pending', verification: 'unavailable', reason: `Provider status could not be refreshed; no new deployment was created. ${safeMessage(error)}` }
            : { status: error.ambiguous ? 'unknown' : 'failed', reason: safeMessage(error) };
        const statuses = { deployed: 'deployed', failed: 'deployment_failed', pending: 'deployment_pending', skipped: 'deployment_skipped', unknown: 'deployment_unknown' };
        await services.updateRun(claimed.id, req.user.id, { deployment: outcome, status: statuses[outcome.status] }).catch(() => null);
        const event = await services.appendRunEvent(claimed.id, req.user.id, { step: 'deployment', status: outcome.status, detail: outcome }).catch(() => null);
        if (event) makeEmitter(req, req.user.id)(event);
      }
      respondError(res, error);
    }
  });
  return router;
}
export default createV2Router();
