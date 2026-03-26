const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err.message);
});

process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION:', reason);
});

const app = express();

app.use(cors({
  origin: [/https:\/\/.*\.vercel\.app$/, "https://devsphere-sj.vercel.app", "https://dev-sphere-sj.vercel.app", "http://localhost:3000"],
  credentials: true
}));
app.use(express.json());

app.get("/", (req, res) => {
  res.send("DevSphere API Running");
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "healthy",
    mongo: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    hasMongoUri: !!process.env.MONGO_URI,
    envVarsLoaded: Object.keys(process.env).length
  });
});

const MONGODB_URI = process.env.MONGO_URI;
if (MONGODB_URI) {
  mongoose.connect(MONGODB_URI)
    .then(() => console.log("MongoDB Connected"))
    .catch(err => console.error("MongoDB Connection Error:", err.message));
} else {
  console.warn("WARNING: MONGO_URI is not defined.");
}

// Routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/profile", require("./routes/profile"));
app.use("/api/posts", require("./routes/post"));
app.use("/api/code", require("./routes/code"));
app.use("/api/ai", require("./routes/ai"));
app.use("/api/workspaces", require("./routes/workspaces"));
app.use("/api/projects", require("./routes/projects"));
app.use("/api/git", require("./routes/git"));
app.use("/api/marketplace", require("./routes/marketplace"));
app.use("/api/analytics", require("./routes/analytics"));

// Global Error Handler
app.use((err, req, res, next) => {
  console.error("Express Error:", err.message);
  res.status(err.status || 500).json({ error: err.message || "Internal Server Error" });
});

// Conditionally listen if not running in Vercel Serverless environment
if (process.env.NODE_ENV !== 'production' || process.env.RENDER) {
  const PORT = process.env.PORT || 5050;
  app.listen(PORT, () => console.log(`API Server running on port ${PORT}`));
}

module.exports = app; // For Vercel serverless
