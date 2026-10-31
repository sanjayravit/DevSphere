import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'node:http';
import { Server } from 'socket.io';
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
import v2Routes, { authenticateSocket } from './routes/v2.js';

const app = express();
const server = http.createServer(app);
const allowedOrigins = (process.env.CLIENT_ORIGINS || '').split(',').map(origin => origin.trim()).filter(Boolean);
const originAllowed = (origin) => !origin || allowedOrigins.includes(origin) || /^https:\/\/.+\.(vercel\.app|e2b\.app)$/.test(origin) || /^http:\/\/localhost:\d+$/.test(origin);
const corsOptions = {
  origin(origin, callback) { callback(originAllowed(origin) ? null : new Error('Origin is not allowed by CORS.'), originAllowed(origin)); },
  credentials: true
};
const io = new Server(server, { cors: corsOptions, path: '/socket.io' });
io.use(authenticateSocket);
io.on('connection', socket => {
  socket.join(`devsphere:user:${socket.data.userId}`);
});
app.set('io', io);

app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none');
  next();
});
app.use(cors(corsOptions));
app.use(express.json({ limit: '2mb' }));

app.get('/', (_req, res) => res.send('DevSphere API Running'));
app.get('/api/health', async (_req, res) => {
  if (!db) return res.status(503).json({ status: 'unhealthy', database: 'disconnected', message: 'Firebase Admin SDK is not configured.' });
  try {
    await db.collection('health').limit(1).get();
    res.json({ status: 'healthy', database: 'firestore', projectId: process.env.FIREBASE_PROJECT_ID || null });
  } catch (error) { res.status(503).json({ status: 'unhealthy', database: 'firestore', error: error.message }); }
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
app.use('/api/v2', v2Routes);

app.use((err, _req, res, _next) => {
  // Do not serialize request headers, provider responses, or secrets into logs.
  console.error('Express request failed:', err.message);
  res.status(err.status || 500).json({ error: err.status && err.status < 500 ? err.message : 'Internal Server Error' });
});

if (!process.env.VERCEL) {
  const port = Number(process.env.PORT) || 5050;
  server.listen(port, '0.0.0.0', () => console.log(`DevSphere API listening on ${port}`));
}

export { app, server, io };
export default app;
