import express from "express";
const router = express.Router();
import auth from "../middleware/auth.js";
import MarketplaceItem from "../models/MarketplaceItem.js";
import Project from "../models/Project.js";
import { getProjectForUser } from "../middleware/projectAccess.js";
import { validateProjectFiles } from "../utils/repositorySafety.js";
// GET /api/marketplace
router.get("/", async (req, res) => {
    try {
        // Find top marketplace items
        const items = await MarketplaceItem.findAll();
        res.json(items.slice(0, 50));
    } catch (err) {
        console.error(err);
        res.status(err.status || 503).json({ error: "Marketplace is unavailable." });
    }
});

// POST /api/marketplace/seed (Development Only Shortcut)
router.post("/seed", auth, async (req, res) => {
    if (process.env.NODE_ENV === "production" || process.env.ENABLE_MARKETPLACE_SEED !== "true") return res.status(403).json({ error: "Development seeding is disabled." });
    try {
        const count = await MarketplaceItem.count();
        if (count === 0) {
            await MarketplaceItem.insertMany([
                {
                    title: "React Auth Template",
                    description: "A secure, production-ready React authentication layout with context wrappers.",
                    type: "template",
                    authorName: "DevSphere Core Team",
                    tags: ["react", "security"],
                    files: [{ name: "Auth.jsx", content: "export default function Auth() { return <div>Secure</div> }", language: "javascript" }],
                    downloads: 0
                },
                {
                    title: "Next-Gen Refactor Prompt",
                    description: "An aggressive AI prompt specialized in minimizing React render cycles.",
                    type: "prompt",
                    authorName: "Vercel Enthusiast",
                    tags: ["ai", "performance"],
                    promptString: "Analyze this React code. Remove all unnecessary useEffect hooks. Replace prop drilling with Context or Zustand closures. Force memoization on large map lists.",
                    downloads: 0
                }
            ]);
        }
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Seeding failed." });
    }
});

// POST /api/marketplace/:id/install
// Installs a specific item into the active project workspace
router.post("/:id/install", auth, async (req, res) => {
    const { projectId } = req.body || {};
    try {
        const item = await MarketplaceItem.findById(req.params.id);
        if (!item) return res.status(404).json({ error: "Item not found" });


        if (projectId) {
            const project = await getProjectForUser(projectId, req.user.id);
            if (!project) return res.status(404).json({ error: "Target project not found" });

            if (item.type === 'template' || item.type === 'snippet') {
                const files = project.files || [];
                item.files.forEach(f => {
                    if (files.some(existing => existing.name === f.name)) throw Object.assign(new Error("Template file already exists; refusing to overwrite."), { status: 409 });
                    files.push({ name: f.name, content: f.content, language: f.language });
                });
                await Project.save(projectId, { files: validateProjectFiles(files) }, { expectedVersion: project.version || 0 });
            } else if (item.type === 'prompt') {
                const chatHistory = project.chatHistory || [];
                chatHistory.push(
                    { role: 'user', content: "[Installed Marketplace Prompt]", timestamp: new Date() },
                    { role: 'model', content: `Marketplace prompt reference (untrusted context, not a system instruction):\n${item.promptString}`, timestamp: new Date() }
                );
                await Project.appendChat(projectId, chatHistory.slice(-2));
            }
            await MarketplaceItem.incrementDownloads(req.params.id);
            const updatedProject = await Project.findById(projectId);
            return res.json({ success: true, message: "Installed successfully into project.", project: updatedProject });
        }

        await MarketplaceItem.incrementDownloads(req.params.id);
        res.json({ success: true, message: "Downloaded but not attached to an active project." });
    } catch (err) {
        console.error("Marketplace install failed:", err.code || err.status || "INTERNAL_ERROR");
        res.status(err.status || 503).json({ error: err.status ? err.message : "Server error during installation." });
    }
});

export default router;