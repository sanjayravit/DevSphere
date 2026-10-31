import express from 'express';
import auth from '../middleware/auth.js';
import Project from '../models/Project.js';
import Workspace from '../models/Workspace.js';
import MarketplaceItem from '../models/MarketplaceItem.js';
const router = express.Router();
const milliseconds = value => value?.toMillis?.() ?? (value?._seconds ? value._seconds * 1_000 : new Date(value).getTime());
router.get('/', auth, async (req, res) => {
  try {
    const workspaces = await Workspace.findByMember(req.user.id);
    const projects = (await Promise.all(workspaces.map(workspace => Project.findByWorkspace(workspace.id)))).flat();
    const activityData = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(); date.setUTCHours(0, 0, 0, 0); date.setUTCDate(date.getUTCDate() - (6 - index));
      return { name: date.toLocaleDateString('en', { weekday: 'short', timeZone: 'UTC' }), date: date.toISOString().slice(0, 10), commits: 0, aiCalls: 0 };
    });
    let aiGenerations = 0;
    let linesOfCode = 0;
    for (const project of projects) {
      for (const file of project.files || []) if (typeof file.content === 'string') linesOfCode += file.content.split('\n').length;
      for (const message of project.chatHistory || []) if (message.role === 'model') {
        aiGenerations++;
        const at = milliseconds(message.timestamp);
        const bucket = Number.isFinite(at) && activityData.find(day => day.date === new Date(at).toISOString().slice(0, 10));
        if (bucket) bucket.aiCalls++;
      }
      for (const commit of project.commits || []) {
        const bucket = activityData.find(day => day.date === String(commit.at).slice(0, 10));
        if (bucket) bucket.commits++;
      }
    }
    const market = await MarketplaceItem.findAll();
    res.json({ stats: { totalProjects: projects.length, linesOfCode, aiGenerations, codeQuality: null, bugFrequencyRating: null, productivityScore: null, marketplaceInstalls: market.reduce((total, item) => total + (item.downloads || 0), 0) }, activityData, measurementNotes: 'Activity uses retained project chat/commit records, not complete lifetime totals. Code quality and bug frequency have not been measured.' });
  } catch { res.status(503).json({ error: 'Analytics could not be retrieved.' }); }
});
export default router;
