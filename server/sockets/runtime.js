import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { authenticateSocket } from './authenticateSocket.js';
import { getProjectForUser } from '../middleware/projectAccess.js';
import User from '../models/user.js';
import { corsOptions, originAllowed } from '../config/cors.js';
import { setSocketServer } from './socketHandler.js';

const projectRoom = id => `project:${id}`;
const roomIdValid = id => typeof id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(id);
export function createSocketServer(server, overrides = {}) {
  const access = overrides.getProjectForUser || getProjectForUser;
  const getUser = overrides.getUser || User.findById;
  const io = new Server(server, { cors: corsOptions, path: '/socket.io', maxHttpBufferSize: 256_000, allowRequest: (req, callback) => callback(null, originAllowed(req.headers.origin)) });
  const redisClients = [];
  if (process.env.REDIS_URL) {
    const pub = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1 });
    const sub = pub.duplicate();
    for (const connection of [pub, sub]) { connection.on('error', () => console.error('Socket.IO Redis connection unavailable.')); redisClients.push(connection); }
    io.adapter(createAdapter(pub, sub));
  }
  setSocketServer(io);
  io.use(authenticateSocket);
  const presence = new Map();
  const publishPresence = roomId => io.to(projectRoom(roomId)).emit('room-users-update', [...(presence.get(roomId)?.values() || [])]);
  io.on('connection', socket => {
    socket.join(`devsphere:user:${socket.data.userId}`);
    let expiry;
    if (socket.data.expiresAt) {
      expiry = setTimeout(() => socket.disconnect(true), Math.min(2_147_483_647, Math.max(0, socket.data.expiresAt * 1_000 - Date.now())));
      expiry.unref();
    }
    let count = 0;
    let windowStart = Date.now();
    socket.use((_packet, next) => {
      if (Date.now() - windowStart > 10_000) { count = 0; windowStart = Date.now(); }
      if (++count > 250) return next(new Error('Socket event rate limit exceeded.'));
      if (socket.data.expiresAt && socket.data.expiresAt * 1_000 <= Date.now()) { socket.disconnect(true); return; }
      next();
    });
    const error = () => socket.emit('collaboration:error', { error: 'Project access denied or invalid collaboration data.' });
    async function member(roomId) {
      if (!roomIdValid(roomId) || !socket.rooms.has(projectRoom(roomId))) throw new Error('Not joined.');
      await access(roomId, socket.data.userId); // Do not rely on a stale room grant.
    }
    const leave = roomId => {
      socket.leave(projectRoom(roomId));
      presence.get(roomId)?.delete(socket.id);
      publishPresence(roomId);
      socket.to(projectRoom(roomId)).emit('user-left', socket.id);
      if (!presence.get(roomId)?.size) presence.delete(roomId);
    };
    socket.on('join-room', async (payload = {}, acknowledge) => {
      try {
        const { roomId } = payload;
        if (!roomIdValid(roomId)) throw new Error('Invalid room.');
        await access(roomId, socket.data.userId);
        const user = await getUser(socket.data.userId);
        socket.data.profile = { id: socket.data.userId, name: String(user?.name || user?.username || 'Developer').slice(0, 100), avatar: user?.avatar || '' };
        await socket.join(projectRoom(roomId));
        if (!presence.has(roomId)) presence.set(roomId, new Map());
        presence.get(roomId).set(socket.id, { socketId: socket.id, user: socket.data.profile });
        publishPresence(roomId);
        socket.to(projectRoom(roomId)).emit('user-joined', { socketId: socket.id, user: socket.data.profile });
        if (typeof acknowledge === 'function') acknowledge({ ok: true });
      } catch { error(); if (typeof acknowledge === 'function') acknowledge({ ok: false }); }
    });
    socket.on('leave-room', (payload) => { const roomId = payload?.roomId; if (roomIdValid(roomId) && socket.rooms.has(projectRoom(roomId))) leave(roomId); });
    const relay = (event, target, validate, transform = payload => payload) => socket.on(event, async (payload = {}) => {
      try {
        await member(payload.roomId);
        if (!validate(payload)) throw new Error('Invalid payload.');
        socket.to(projectRoom(payload.roomId)).emit(target, transform(payload));
      } catch { error(); }
    });
    relay('code-change', 'code-update', ({ code }) => typeof code === 'string' ? code.length <= 100_000 : code && typeof code.code === 'string' && code.code.length <= 100_000 && Number.isInteger(code.fileIndex) && code.fileIndex >= 0 && code.fileIndex < 100, ({ code }) => code);
    relay('cursor-change', 'cursor-update', ({ cursorData }) => Number.isInteger(cursorData?.line) && cursorData.line > 0 && cursorData.line <= 1_000_000 && Number.isInteger(cursorData?.column) && cursorData.column > 0 && cursorData.column <= 100_000, ({ cursorData }) => ({ socketId: socket.id, line: cursorData.line, column: cursorData.column, user: socket.data.profile }));
    relay('chat-message', 'chat-update', ({ message }) => typeof message?.text === 'string' && message.text.length <= 10_000, ({ message }) => ({ id: `${socket.id}-${Date.now()}`, text: message.text, timestamp: new Date().toISOString(), user: socket.data.profile }));
    relay('ai-response', 'ai-update', ({ message }) => ['user', 'model'].includes(message?.role) && typeof message.content === 'string' && message.content.length <= 100_000, ({ message }) => ({ role: message.role, content: message.content, sharedBy: socket.data.userId }));
    relay('user-typing', 'user-typing-update', ({ isTyping }) => typeof isTyping === 'boolean', ({ isTyping }) => ({ socketId: socket.id, user: socket.data.profile, isTyping }));
    socket.on('disconnecting', () => {
      clearTimeout(expiry);
      for (const room of socket.rooms) if (room.startsWith('project:')) leave(room.slice(8));
    });
  });
  io.on('close', () => { for (const connection of redisClients) connection.disconnect(); });
  const originalClose = io.close.bind(io);
  io.close = callback => { for (const connection of redisClients) connection.disconnect(); return originalClose(callback); };
  return io;
}
