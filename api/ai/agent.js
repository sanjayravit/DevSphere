import { GoogleGenerativeAI } from '@google/generative-ai';
import jwt from 'jsonwebtoken';
import { db } from '../../server/firebaseAdmin.js';
import Project from '../../server/models/Project.js';
import Workspace from '../../server/models/Workspace.js';

export default async function aiAgent(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const token = req.headers.authorization?.split(' ')[1];
  if (!token || !process.env.JWT_SECRET) return res.status(401).json({ error: 'Authentication required.' });
  let user;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    user = decoded.user || decoded;
    if (!user?.id) throw new Error('Invalid token payload');
  } catch { return res.status(401).json({ error: 'Token is not valid.' }); }
  if (!process.env.GEMINI_API_KEY) return res.status(503).json({ error: 'GEMINI_API_KEY is not configured.' });
  const { action, code = '', projectId, message = '' } = req.body || {};
  if (typeof code !== 'string' || code.length > 100_000) return res.status(400).json({ error: 'Invalid code input.' });
  try {
    let history = [];
    if (projectId) {
      const project = await Project.findById(projectId);
      if (!project) return res.status(404).json({ error: 'Project not found.' });
      const workspace = await Workspace.findById(project.workspaceId);
      if (!workspace || !workspace.members?.includes(String(user.id))) return res.status(403).json({ error: 'You are not authorized to access this project.' });
      if (db) {
        const snapshot = await db.collection('aiChats').where('projectId', '==', projectId).orderBy('timestamp', 'asc').limit(50).get();
        history = snapshot.docs.map(doc => { const item = doc.data(); return { role: item.role === 'user' ? 'user' : 'model', parts: [{ text: item.content }] }; });
      }
    }
    const model = new GoogleGenerativeAI(process.env.GEMINI_API_KEY).getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-1.5-flash' });
    const instruction = action === 'chat' ? `Answer the user's coding question: ${message}` : action === 'explain' ? 'Explain this code clearly.' : action === 'optimize' ? 'Optimize the code and return only the replacement code.' : action === 'fix' || action === 'bugs' ? 'Identify and fix issues. Return only the replacement code.' : 'Analyze this code.';
    const prompt = `${instruction}\n\n${code}`;
    const result = action === 'chat' ? await model.startChat({ history }).sendMessage(prompt) : await model.generateContent(prompt);
    const responseText = result.response.text();
    if (projectId && db) {
      const timestamp = new Date();
      await db.collection('aiChats').add({ projectId, role: 'user', content: prompt, timestamp });
      await db.collection('aiChats').add({ projectId, role: 'model', content: responseText, timestamp: new Date(timestamp.getTime() + 1) });
    }
    return res.json({ result: responseText });
  } catch (error) {
    console.error('AI endpoint failed:', error.message);
    return res.status(502).json({ error: 'AI request failed.' });
  }
}
