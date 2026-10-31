import Project from '../models/Project.js';
import Workspace from '../models/Workspace.js';
import { ServiceError } from '../utils/security.js';

export async function getProjectForUser(projectId, userId) {
  if (typeof projectId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(projectId)) throw new ServiceError('Invalid project ID.', { status: 400 });
  const project = await Project.findById(projectId);
  const workspace = project && await Workspace.findById(project.workspaceId);
  if (!project || !workspace?.members?.includes(String(userId))) throw new ServiceError('Project not found.', { status: 404 });
  return project;
}

export async function authorizeProject(req, res, next) {
  try { req.project = await getProjectForUser(req.params.projectId || req.body?.projectId, req.user.id); next(); }
  catch (error) { res.status(error.status || 503).json({ error: error.status ? error.message : 'Project access could not be verified.' }); }
}
