import { io } from "socket.io-client";

// Use VITE_ prefix for Vite projects (not REACT_APP_)
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";

const socket = io(SOCKET_URL, {
    transports: ["websocket", "polling"],
    withCredentials: true,
    reconnectionAttempts: 3,
    timeout: 5000,
});

export default socket;
