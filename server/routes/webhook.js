import express from 'express';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import auth, { requireRepositoryOperator } from '../middleware/auth.js';
import { getProjectForUser } from '../middleware/projectAccess.js';
import Project from '../models/Project.js';
import Workspace from '../models/Workspace.js';
import { requireDb, recordProjectEvent } from '../services/firebaseService.js';
import { emitRoomEvent } from '../sockets/socketHandler.js';
import { safeMessage } from '../utils/security.js';

export function verifyWebhookSignature(req, source) {
  const secret = process.env[source === 'github' ? 'GITHUB_WEBHOOK_SECRET' : 'VERCEL_WEBHOOK_SECRET'];
  if (!secret) return { ok: false, configured: false };
  const raw = req.rawBody;
  if (!Buffer.isBuffer(raw)) return { ok: false, configured: true };
  const signature = req.headers[source === 'github' ? 'x-hub-signature-256' : 'x-vercel-signature'];
  const expected = source === 'github' ? `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}` : createHmac('sha1', secret).update(raw).digest('hex');
  if (typeof signature !== 'string' || signature.length !== expected.length) return { ok: false, configured: true };
  return { ok: timingSafeEqual(Buffer.from(signature), Buffer.from(expected)), configured: true };
}
export function createWebhookRouter(overrides = {}) {
  const services = { getProjectForUser, findProject: Project.findById, findWorkspace: Workspace.findById, saveProject: Project.save, requireDb, recordProjectEvent, emitRoomEvent, ...overrides };
  const router = express.Router();
  router.get('/history', auth, async (req, res) => {
    try {
      const scope = req.query.scope || 'project';
      let projectIds;
      if (scope === 'workspace') {
        const workspaceId = req.query.projectId;
        if (typeof workspaceId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(workspaceId)) return res.status(400).json({ error: 'Invalid workspace ID.' });
        const workspace = await services.findWorkspace(workspaceId);
        if (!workspace?.members?.includes(req.user.id)) return res.status(404).json({ error: 'Workspace not found.' });
        const projects = await services.requireDb().collection('projects').where('workspaceId', '==', workspaceId).limit(50).get();
        projectIds = projects.docs.map(doc => doc.id);
      } else if (scope === 'project') {
        const project = await services.getProjectForUser(req.query.projectId, req.user.id);
        projectIds = [project.id];
      } else return res.status(400).json({ error: 'Invalid history scope.' });
      const records = await Promise.all(projectIds.map(async id => {
        const snapshot = await services.requireDb().collection('projects').doc(id).collection('events').orderBy('timestamp', 'desc').limit(50).get();
        return snapshot.docs.map(doc => ({ ...doc.data(), projectId: id, id: doc.id }));
      }));
      res.json({ events: records.flat().sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp))).slice(0, 50) });
    } catch (error) { res.status(error.status || 503).json({ error: error.status ? safeMessage(error) : 'Event history is unavailable.' }); }
  });
  router.post('/configuration', auth, requireRepositoryOperator, async (req, res) => {
    try {
      const project = await services.getProjectForUser(req.body?.projectId, req.user.id);
      const workspace = await services.findWorkspace(project.workspaceId);
      if (workspace.owner !== req.user.id) return res.status(403).json({ error: 'Only the workspace owner may configure repository webhooks.' });
      const repository = req.body?.repository;
      if (typeof repository !== 'string' || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) || repository.toLowerCase() !== process.env.GITHUB_REPOSITORY?.toLowerCase()) return res.status(400).json({ error: 'Repository must match the server-configured GITHUB_REPOSITORY.' });
      await services.saveProject(project.id, { configuration: { ...project.configuration, repository } });
      res.json({ projectId: project.id, repository });
    } catch (error) { res.status(error.status || 503).json({ error: safeMessage(error) }); }
  });
  router.post('/', async (req, res) => {
    const source = req.headers['x-github-event'] ? 'github' : req.headers['x-vercel-signature'] ? 'vercel' : null;
    if (!source) return res.status(400).json({ error: 'A signed GitHub or Vercel event is required.' });
    const verified = verifyWebhookSignature(req, source);
    if (!verified.configured) return res.status(503).json({ error: `${source} webhook verification is not configured.` });
    if (!verified.ok) return res.status(401).json({ error: 'Invalid webhook signature.' });
    try {
      const projectId = req.query.projectId;
      if (typeof projectId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(projectId)) return res.status(400).json({ error: 'A configured projectId is required.' });
      const project = await services.findProject(projectId);
      const workspace = project && await services.findWorkspace(project.workspaceId);
      if (!project || !workspace || !project.configuration?.repository) return res.status(404).json({ error: 'Webhook target is not configured.' });
      const payload = req.body || {};
      const meta = payload.payload?.deployment?.meta || {};
      const repo = source === 'github' ? payload.repository?.full_name : meta.githubCommitOrg && meta.githubCommitRepo ? `${meta.githubCommitOrg}/${meta.githubCommitRepo}` : null;
      if (typeof repo !== 'string' || repo.toLowerCase() !== project.configuration.repository.toLowerCase()) return res.status(403).json({ error: 'Webhook repository does not match this project.' });
      const kind = source === 'github' ? req.headers['x-github-event'] : payload.type;
      const failed = source === 'github' ? kind === 'check_run' && payload.action === 'completed' && ['failure', 'timed_out', 'action_required', 'cancelled'].includes(payload.check_run?.conclusion) : ['deployment.error', 'deployment.canceled'].includes(kind);
      const message = failed ? source === 'github' ? payload.check_run?.output?.summary || payload.check_run?.output?.title || `GitHub check ${payload.check_run?.name || '(unnamed)'} concluded ${payload.check_run?.conclusion}.` : `Vercel reported ${kind} for deployment ${payload.payload?.deployment?.id || '(unknown)'}.` : null;
      const event = {
        type: failed ? source === 'vercel' ? 'VERCEL_ERROR_DETECTED' : 'ERROR_DETECTED' : 'PROVIDER_EVENT', source, repo, projectId, workspaceId: project.workspaceId,
        providerEvent: String(kind).slice(0, 100), ...(message ? { error: String(message).slice(0, 4_000), suggestedIntent: `Investigate the ${source} failure in ${repo}: ${String(message).slice(0, 2_000)}. Use actual repository context, propose a minimal fix and validate it.` } : {}),
        execution: 'not-requested', note: 'Provider evidence only. Open a V2 run to generate a QA-checked, policy-gated proposal. Webhooks never execute changes.'
      };
      // Await the durable write BEFORE acknowledgement (serverless-safe); the
      // signed body hash deduplicates even if a replay changes delivery headers.
      const deliveryId = createHash('sha256').update(source).update(req.rawBody).digest('hex');
      const stored = await services.recordProjectEvent(projectId, event, deliveryId);
      if (stored) {
        for (const userId of new Set(workspace.members || [])) {
          const room = `devsphere:user:${userId}`;
          services.emitRoomEvent(room, 'webhook:event', stored);
          if (failed) services.emitRoomEvent(room, source === 'vercel' ? 'deployment_failed' : 'error_detected', stored);
        }
      }
      res.json({ status: stored ? 'recorded' : 'duplicate', execution: 'not-requested' });
    } catch (error) { res.status(error.status || 503).json({ error: safeMessage(error) }); }
  });
  return router;
}
export default createWebhookRouter();
