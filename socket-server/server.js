const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
require("dotenv").config();

const app = express();

// Basic health check endpoint
app.get("/", (req, res) => {
    res.send("DevSphere Socket.io Server is running!");
});

app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        // Allows Vercel origins and localhost for development
        origin: [
            /^https:\/\/.*\.vercel\.app$/,
            "https://devsphere-sj.vercel.app",
            "https://dev-sphere-sj.vercel.app",
            "http://localhost:3000",
            "http://localhost:5173" // Vite default
        ],
        methods: ["GET", "POST"],
        credentials: true
    }
});

io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    // Join a specific project room
    socket.on("join-room", ({ roomId, user }) => {
        socket.join(roomId);
        socket.to(roomId).emit("user-joined", { socketId: socket.id, user });
        console.log(`User ${user?.name || socket.id} joined room ${roomId}`);
    });

    // Broadcast code changes to others in the room
    socket.on("code-change", ({ roomId, code }) => {
        socket.to(roomId).emit("code-update", code);
    });

    // Broadcast cursor movements
    socket.on("cursor-change", ({ roomId, cursorData }) => {
        socket.to(roomId).emit("cursor-update", { socketId: socket.id, ...cursorData });
    });

    // Broadcast chat messages
    socket.on("chat-message", ({ roomId, message }) => {
        socket.to(roomId).emit("chat-update", message);
    });

    // Broadcast AI copilot updates
    socket.on("ai-response", ({ roomId, message }) => {
        socket.to(roomId).emit("ai-update", message);
    });

    socket.on("disconnect", () => {
        // Find rooms the user was in and notify others (simplified here)
        // Usually, you'd track users per room for more precise 'user-left' events
        io.emit("user-left", socket.id);
        console.log("User disconnected:", socket.id);
    });
});

const PORT = process.env.PORT || 10000; // Render uses 10000 by default or via PORT env
server.listen(PORT, () => {
    console.log(`Socket server running on port ${PORT}`);
});
