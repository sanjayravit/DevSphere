import express from "express";
import http from "http";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import Redis from "ioredis";
import cors from "cors";
import socketHandler from "./sockets/socketHandler.js";
import { authenticateSocket } from './routes/v2.js';
import "dotenv/config";
const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: [/https:\/\/.*\.vercel\.app$/, "https://devsphere-sj.vercel.app", "https://dev-sphere-sj.vercel.app", "http://localhost:3000"],
        methods: ["GET", "POST"],
        credentials: true
    }
});

// Configure Redis Adapter if URL is provided
if (process.env.REDIS_URL) {
    const pubClient = new Redis(process.env.REDIS_URL);
    const subClient = pubClient.duplicate();
    io.adapter(createAdapter(pubClient, subClient));
    console.log("[Socket Server] Redis Adapter integrated for scaling");
}

// Legacy collaboration remains available without a token; V2 clients supply the existing JWT.
io.use((socket, next) => socket.handshake.auth?.token ? authenticateSocket(socket, next) : next());
socketHandler.init(io);

io.on("connection", (socket) => {
    if (socket.data.userId) socket.join(`devsphere:user:${socket.data.userId}`);
    console.log("User connected:", socket.id);

    socket.on("join-room", ({ roomId, user }) => {
        if (typeof roomId !== 'string' || roomId.startsWith('devsphere:user:')) return;
        socket.join(roomId);
        socket.to(roomId).emit("user-joined", { socketId: socket.id, user });
        console.log(`User ${user?.name || socket.id} joined room ${roomId}`);
    });

    socket.on("code-change", ({ roomId, code }) => {
        socket.to(roomId).emit("code-update", code);
    });

    socket.on("cursor-change", ({ roomId, cursorData }) => {
        socket.to(roomId).emit("cursor-update", { socketId: socket.id, ...cursorData });
    });

    socket.on("chat-message", ({ roomId, message }) => {
        socket.to(roomId).emit("chat-update", message);
    });

    socket.on("user-typing", ({ roomId, user, isTyping }) => {
        socket.to(roomId).emit("user-typing-update", { socketId: socket.id, user, isTyping });
    });

    socket.on("ai-response", ({ roomId, message }) => {
        socket.to(roomId).emit("ai-update", message);
    });

    socket.on("disconnect", () => {
        io.emit("user-left", socket.id);
        console.log("User disconnected:", socket.id);
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Socket server running on port ${PORT}`);
});
