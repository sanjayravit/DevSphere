import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createSocketServer } from './sockets/runtime.js';
import { corsOptions } from './config/cors.js';
import { db } from './firebaseAdmin.js';
import authRoutes from './routes/auth.js';
import profileRoutes from './routes/profile.js';
import postRoutes from './routes/post.js';
import codeRoutes from './routes/code.js';
import aiRoutes from './routes/ai.js';
import workspaceRoutes from './routes/workspaces.js';
import projectRoutes from './routes/projects.js';
import gitRoutes from './routes/git.js';
import marketplaceRoutes from './routes/marketplace.js';
import analyticsRoutes from './routes/analytics.js';
import webhookRoutes from './routes/webhook.js';
import v2Routes from './routes/v2.js';

export function createApp({ v2 = v2Routes } = {}) {
const app = express();
app.disable('x-powered-by');
if (process.env.VERCEL) app.set('trust proxy', 1);
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none');
  next();
});
app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb', verify(req, _res, buffer) { req.rawBody = Buffer.from(buffer); } }));

app.get('/', (_req, res) => res.send('DevSphere API Running'));
app.get('/api/health', async (_req, res) => {
  if (!db) return res.status(503).json({ status: 'unhealthy', database: 'disconnected', message: 'Firebase Admin SDK is not configured.' });
  try {
    await db.collection('health').limit(1).get();
    res.json({ status: 'healthy', database: 'firestore', projectId: process.env.FIREBASE_PROJECT_ID || null });
  } catch (error) { res.status(503).json({ status: 'unhealthy', database: 'firestore', error: 'Firestore could not be reached.' }); }
});

app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/code', codeRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/workspaces', workspaceRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/git', gitRoutes);
app.use('/api/marketplace', marketplaceRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/webhook', webhookRoutes);
app.use('/api/v2', v2);
app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found.' }));

app.use((err, _req, res, _next) => {
  // Do not serialize request headers, provider responses, or secrets into logs.
  console.error('Express request failed:', err.type || err.code || 'INTERNAL_ERROR');
  res.status(err.status || 500).json({ error: err.status && err.status < 500 ? err.message : 'Internal Server Error' });
});

return app;
}

const app = createApp();
const server = http.createServer(app);
const io = process.env.VERCEL ? null : createSocketServer(server);
if (io) app.set('io', io);

if (!process.env.VERCEL && process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const port = Number(process.env.PORT) || 5050;
  server.listen(port, '0.0.0.0', () => console.log(`DevSphere API listening on ${port}`));
}
export { app, server, io };
export default app;
