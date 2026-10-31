import { Emitter } from '@socket.io/redis-emitter';
import Redis from 'ioredis';
let ioInstance = null;
let emitter = null;

if (process.env.REDIS_URL) {
  try { emitter = new Emitter(new Redis(process.env.REDIS_URL)); }
  catch { console.error('Could not initialize Redis Socket.IO emitter.'); }
}

export function setSocketServer(io) { ioInstance = io; }
export const init = setSocketServer;
export function emitRoomEvent(roomId, event, data) {
  if (emitter) emitter.to(roomId).emit(event, data);
  else if (ioInstance) ioInstance.to(roomId).emit(event, data);
}

export function emitEvent(roomId, event, data) {
  if (ioInstance) ioInstance.to(roomId).emit(event, data);
  else if (emitter) emitter.to(roomId).emit(event, data);
}
export function emitGlobalEvent(event, data) {
  if (ioInstance) ioInstance.emit(event, data);
  else if (emitter) emitter.emit(event, data);
}

const socketHandler = { init, emitEvent, emitRoomEvent, emitGlobalEvent };
export default socketHandler;
