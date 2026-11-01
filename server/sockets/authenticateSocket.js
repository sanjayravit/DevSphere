import { verifySession } from '../config/session.js';
export function authenticateSocket(socket, next) {
  try {
    const session = verifySession(socket.handshake.auth?.token);
    socket.data.userId = session.id;
    socket.data.expiresAt = session.expiresAt;
    next();
  } catch { next(new Error('Invalid or expired authentication token.')); }
}
