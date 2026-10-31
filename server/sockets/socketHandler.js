import { Emitter } from '@socket.io/redis-emitter';
import Redis from 'ioredis';
let ioInstance;
let emitter;
let redis;
export function setSocketServer(io) { ioInstance = io; }
export const init = setSocketServer;
function getEmitter() {
  if (!emitter && process.env.REDIS_URL) {
    redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1 });
    redis.on('error', () => console.error('Socket.IO event relay is unavailable; use persisted history.'));
    emitter = new Emitter(redis);
  }
  return emitter;
}
export function emitRoomEvent(room, event, data) {
  if (ioInstance) ioInstance.to(room).emit(event, data);
  else getEmitter()?.to(room).emit(event, data);
}
export const emitEvent = emitRoomEvent;
export function emitGlobalEvent() { throw new Error('Global broadcasts of user data are forbidden. Use an authorized room.'); }
export function closeEmitter() { redis?.disconnect(); redis = null; emitter = null; }
export default { init, emitEvent, emitRoomEvent, emitGlobalEvent };
