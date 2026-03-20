const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("DevSphere API Running");
});

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.log(err));

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

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
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

  socket.on("disconnect", () => {
    // Basic leave handling across all rooms
    io.emit("user-left", socket.id);
  });
});

server.listen(5000, () => console.log("Server running on port 5000"));