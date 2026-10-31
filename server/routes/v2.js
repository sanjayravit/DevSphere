import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';
import auth from '../middleware/auth.js';
import { runDevSphere, executeApprovedRun } from '../engines/orchestrator.js';
import { deployAgent } from '../agents/deployAgent.js';
import { claimRunApproval, getRun, listRuns, updateRun } from '../services/firebaseService.js';
import { proposalHash } from '../engines/orchestrator.js';
import { emitRoomEvent } from '../sockets/socketHandler.js';

const router = express.Router();
const MODES = new Set(['manual', 'approval', 'assisted', 'full-auto']);

const makeEmitter = (req, userId) => (event) => {
  const room = `devsphere:user:${userId}`;
  if (process.env.VERCEL) emitRoomEvent(room, 'devsphere:update', event);
  else req.app.get('io')?.to(room).emit('devsphere:update', event);
};

router.post('/run', auth, async (req, res) => {
  const { input, mode = 'assisted' } = req.body || {};
  if (typeof input !== 'string' || input.trim().length < 8 || input.length > 12_000) return res.status(400).json({ error: 'Input must be between 8 and 12,000 characters.' });
  if (!MODES.has(mode)) return res.status(400).json({ error: 'Mode must be manual, approval, assisted, or full-auto.' });
  try {
    const result = await runDevSphere({ input: input.trim(), mode, userId: req.user.id, emit: makeEmitter(req, req.user.id) });
    res.status(200).json(result);
  } catch (error) {
    res.status(error.message?.includes('not configured') ? 503 : 502).json({ error: error.message, runId: error.runId });
  }
});

router.get('/runs', auth, async (req, res) => {
  try { res.json({ runs: await listRuns(String(req.user.id), Math.min(50, Math.max(1, Number(req.query.limit) || 25))) }); }
  catch (error) { res.status(503).json({ error: error.message }); }
});

router.get('/runs/:runId', auth, async (req, res) => {
  try {
    const run = await getRun(req.params.runId, String(req.user.id));
    if (!run) return res.status(404).json({ error: 'Run not found.' });
    res.json({ run });
  } catch (error) { res.status(503).json({ error: error.message }); }
});

router.post('/runs/:runId/approve', auth, async (req, res) => {
  const { approvalHash, approved = true } = req.body || {};
  if (approved !== true) return res.status(400).json({ error: 'Use the reject endpoint to reject a proposal.' });
  if (typeof approvalHash !== 'string' || !/^[a-f0-9]{64}$/.test(approvalHash)) return res.status(400).json({ error: 'A valid approvalHash is required.' });
  try {
    const existing = await getRun(req.params.runId, String(req.user.id));
    if (!existing) return res.status(404).json({ error: 'Run not found.' });
    const currentHash = proposalHash(existing.proposal?.changes || []);
    const supplied = Buffer.from(approvalHash, 'hex');
    const expected = Buffer.from(currentHash, 'hex');
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected) || currentHash !== existing.approvalHash) return res.status(409).json({ error: 'Approval hash does not match the exact current proposal.' });
    const run = await claimRunApproval(req.params.runId, String(req.user.id), approvalHash);
    if (!run) return res.status(409).json({ error: 'Proposal is no longer pending approval or has already been processed.' });
    const emit = makeEmitter(req, req.user.id);
    emit({ runId: run.id, step: 'approval', status: 'approved', at: new Date().toISOString() });
    const result = await executeApprovedRun({ run, userId: req.user.id, emit });
    res.json(result);
  } catch (error) {
    await updateRun(req.params.runId, String(req.user.id), { status: 'failed', error: error.message }).catch(() => null);
    res.status(502).json({ error: error.message });
  }
});

router.post('/runs/:runId/reject', auth, async (req, res) => {
  try {
    const run = await getRun(req.params.runId, String(req.user.id));
    if (!run) return res.status(404).json({ error: 'Run not found.' });
    if (run.status !== 'pending_approval' || run.approval !== 'pending') return res.status(409).json({ error: 'This run is not awaiting approval.' });
    const updated = await updateRun(run.id, String(req.user.id), { status: 'rejected', approval: 'rejected' });
    makeEmitter(req, req.user.id)({ runId: run.id, step: 'approval', status: 'rejected', at: new Date().toISOString() });
    res.json({ run: updated });
  } catch (error) { res.status(503).json({ error: error.message }); }
});

router.post('/runs/:runId/deploy', auth, async (req, res) => {
  try {
    const run = await getRun(req.params.runId, String(req.user.id));
    if (!run) return res.status(404).json({ error: 'Run not found.' });
    if (!run.pullNumber || !['pull_request', 'deployment_skipped', 'deployment_failed'].includes(run.status)) return res.status(409).json({ error: 'A successfully created pull request is required before deployment.' });
    if (run.decision?.decision === 'ask' && run.approval !== 'approved') return res.status(403).json({ error: 'This workflow has not been approved.' });
    const outcome = await deployAgent({ repo: run.proposal.repository, pullNumber: run.pullNumber });
    const status = outcome.status === 'deployed' ? 'deployed' : outcome.status === 'failed' ? 'deployment_failed' : outcome.status === 'pending' ? 'deployment_pending' : 'deployment_skipped';
    await updateRun(run.id, String(req.user.id), { deployment: outcome, status });
    makeEmitter(req, req.user.id)({ runId: run.id, step: 'deployment', status: outcome.status, detail: outcome, at: new Date().toISOString() });
    res.json({ deployment: outcome });
  } catch (error) {
    await updateRun(req.params.runId, String(req.user.id), { deployment: { status: 'failed', reason: error.message }, status: 'deployment_failed' }).catch(() => null);
    res.status(502).json({ error: error.message });
  }
});

export function authenticateSocket(socket, next) {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication required'));
    if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') return next(new Error('Socket authentication is not configured'));
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_dev_secret');
    const user = decoded.user || decoded;
    if (!user?.id) return next(new Error('Invalid authentication token'));
    socket.data.userId = String(user.id);
    next();
  } catch { next(new Error('Invalid authentication token')); }
}

export default router;
