const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { db } = require("./config/firebase");

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
  res.send("DevSphere API Running on Firebase");
});

app.get("/api/health", async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({
        status: "unhealthy",
        database: "disconnected",
        message: "Firebase Admin SDK not initialized. Check your environment variables."
      });
    }
    // Simple firestore connectivity check
    await db.collection("health").get();
    res.json({
      status: "healthy",
      database: "firestore",
      envVarsLoaded: Object.keys(process.env).filter(k => k.startsWith("FIREBASE_")).length
    });
  } catch (err) {
    res.status(500).json({ status: "unhealthy", error: err.message });
  }
});

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

