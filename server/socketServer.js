const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: ["https://devsphere-sj.vercel.app", "https://dev-sphere-sj.vercel.app", "http://localhost:3000"],
        methods: ["GET", "POST"],
        credentials: true
    }
});

io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("join-room", ({ roomId, user }) => {
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
