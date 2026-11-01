import { io } from 'socket.io-client';
export const socketOrigin = () => import.meta.env.VITE_SOCKET_URL || (import.meta.env.VITE_API_URL ? new URL(import.meta.env.VITE_API_URL, window.location.origin).origin : window.location.origin);
const socket = io(socketOrigin(), {
  autoConnect: false, transports: ['websocket', 'polling'], withCredentials: true,
  auth: callback => callback({ token: localStorage.getItem('token') }), reconnection: true, reconnectionAttempts: 10, reconnectionDelay: 1_000, timeout: 10_000
});
window.addEventListener('devsphere:session', () => {
  const reconnect = socket.connected;
  socket.disconnect();
  if (reconnect && localStorage.getItem('token')) socket.connect();
});
export default socket;
