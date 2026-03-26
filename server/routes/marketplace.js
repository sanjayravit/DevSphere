const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const MarketplaceItem = require("../models/MarketplaceItem");
const Project = require("../models/Project");

// GET /api/marketplace
router.get("/", async (req, res) => {
    try {
        // Find top marketplace items
        const items = await MarketplaceItem.findAll();
        res.json(items.slice(0, 50));
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server Error" });
    }
});

// POST /api/marketplace/seed (Development Only Shortcut)
router.post("/seed", async (req, res) => {
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
    const { projectId } = req.body;
    try {
        const item = await MarketplaceItem.findById(req.params.id);
        if (!item) return res.status(404).json({ error: "Item not found" });

        await MarketplaceItem.incrementDownloads(req.params.id);

        if (projectId) {
            const project = await Project.findById(projectId);
            if (!project) return res.status(404).json({ error: "Target project not found" });

            if (item.type === 'template' || item.type === 'snippet') {
                const files = project.files || [];
                item.files.forEach(f => {
                    files.push({ name: f.name, content: f.content, language: f.language });
                });
                await Project.save(projectId, { ...project, files });
            } else if (item.type === 'prompt') {
                const chatHistory = project.chatHistory || [];
                chatHistory.push(
                    { role: 'user', content: "[Installed Marketplace Prompt]", timestamp: new Date() },
                    { role: 'model', content: `**System Prompt Configured:**\n${item.promptString}\n\n*You can now ask questions relying on this system prompt bounds.*`, timestamp: new Date() }
                );
                await Project.save(projectId, { ...project, chatHistory });
            }
            const updatedProject = await Project.findById(projectId);
            return res.json({ success: true, message: "Installed successfully into project.", project: updatedProject });
        }

        res.json({ success: true, message: "Downloaded but not attached to an active project." });
    } catch (err) {
        console.error("Install error:", err);
        res.status(500).json({ error: "Server error during installation." });
    }
});

module.exports = router;

