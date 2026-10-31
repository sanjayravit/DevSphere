import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createSocketServer } from './sockets/runtime.js';

export function startSocketServer() {
  const app = express();
  app.get('/', (_req, res) => res.send('DevSphere authenticated Socket.IO server is running.'));
  const server = http.createServer(app);
  const io = createSocketServer(server);
  const port = Number(process.env.PORT) || 10000;
  server.listen(port, '0.0.0.0', () => console.log(`Socket server listening on ${port}`));
  return { app, server, io };
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) startSocketServer();
