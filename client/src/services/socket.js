import { io } from "socket.io-client";

// Use VITE_ prefix for Vite projects (not REACT_APP_)
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "https://socket-io-live-collab.onrender.com";

const socket = io(SOCKET_URL, {
    transports: ["websocket", "polling"],
    withCredentials: true,
    reconnection: true,
    reconnectionAttempts: 10, // Increased for better persistence
    reconnectionDelay: 1000,
    timeout: 10000,
});

export default socket;
