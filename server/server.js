const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
require("dotenv").config();

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err.message);
});

process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION:', reason);
});

const app = express();

app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());

app.get("/", (req, res) => {
  res.send("DevSphere API Running");
});
app.get("/api/health", (req, res) => {
  console.log("Health Check Headers:", req.headers);
  res.json({
    status: "healthy",
    headers: req.headers,
    mongo: mongoose.connection.readyState === 1 ? "connected" : "disconnected"
  });
});

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.error("MongoDB Connection Error:", err.message));

const authRoutes = require("./routes/auth");
app.use("/api/auth", authRoutes);

const profileRoutes = require("./routes/profile");
app.use("/api/profile", profileRoutes);

const postRoutes = require("./routes/post");
app.use("/api/posts", postRoutes);

const codeRoutes = require("./routes/code");
app.use("/api/code", codeRoutes);

const aiRoutes = require("./routes/ai");
app.use("/api/ai", aiRoutes);

const workspaceRoutes = require("./routes/workspaces");
app.use("/api/workspaces", workspaceRoutes);

const projectRoutes = require("./routes/projects");
app.use("/api/projects", projectRoutes);

const gitRoutes = require("./routes/git");
app.use("/api/git", gitRoutes);

const marketplaceRoutes = require("./routes/marketplace");
app.use("/api/marketplace", marketplaceRoutes);

const analyticsRoutes = require("./routes/analytics");
app.use("/api/analytics", analyticsRoutes);

// Global Express 5 error handler (must have 4 args)
app.use((err, req, res, next) => {
  console.error("Express Error:", err.message);
  res.status(err.status || 500).json({ error: err.message || "Internal Server Error" });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["https://devsphere-sj.vercel.app", "https://dev-sphere-sj.vercel.app", "http://localhost:3000"],
    methods: ["GET", "POST"]
  }
});

io.on("connection", (socket) => {
  socket.on("join-room", ({ roomId, user }) => {
    socket.join(roomId);
    socket.to(roomId).emit("user-joined", { socketId: socket.id, user });
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
  });
});

const PORT = process.env.PORT || 5001;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
