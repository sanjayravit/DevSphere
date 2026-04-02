const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const Workspace = require("../models/Workspace");
const Project = require("../models/Project");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

// AI Scaffolding Helper
const generateScaffoldedCode = async (name, language) => {
    if (!process.env.GEMINI_API_KEY) return null;
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const prompt = `Generate a well-structured, production-ready starter ${language} project named "${name}".
Include:
- Imports and setup
- A clear main entry point
- 2-3 example functions or classes relevant to the project name
- Comments explaining key sections
Return ONLY the raw code, no markdown blocks.`;
        const result = await model.generateContent(prompt);
        return result.response.text();
    } catch (e) {
        console.error("AI Scaffold Error:", e.message);
        return null;
    }
};

// Create Project in a Workspace
router.post("/:workspaceId", auth, async (req, res) => {
    try {
        const { name, language, generateWithAI } = req.body;
        const workspaceId = req.params.workspaceId;

        const workspace = await Workspace.findById(workspaceId);
        if (!workspace || !workspace.members.includes(req.user.id)) {
            return res.status(404).json({ msg: "Workspace not found or unauthorized" });
        }

        // Add default main file extension mapping based on request language
        let fileExt = "js";
        if (language === "python") fileExt = "py";
        if (language === "java") fileExt = "java";
        if (language === "c") fileExt = "c";
        if (language === "cpp") fileExt = "cpp";

        // AI-powered scaffolding: generate starter code if requested
        let initialContent = `// Welcome to your new ${name} project\n// Start building something amazing!\n`;
        if (generateWithAI) {
            const aiCode = await generateScaffoldedCode(name, language || "javascript");
            if (aiCode) initialContent = aiCode;
        }

        const project = await Project.create({
            name,
            workspaceId,
            files: [{ name: `main.${fileExt}`, content: initialContent, language: language || "javascript" }],
            chatHistory: []
        });

        res.json(project);
    } catch (err) {
        console.error("Error creating project:", err);
        res.status(500).json({ msg: "Server Error", error: err.message });
    }
});

// Get all Projects in a Workspace (Overview)
router.get("/workspace/:workspaceId", auth, async (req, res) => {
    try {
        const workspaceId = req.params.workspaceId;

        const workspace = await Workspace.findById(workspaceId);
        if (!workspace || !workspace.members.includes(req.user.id)) {
            return res.status(404).json({ msg: "Workspace not found or unauthorized" });
        }

        const projects = await Project.findByWorkspace(workspaceId);
        // Transform to exclude heavy items for overview if needed, but Firestore returns what you ask for.
        // For simplicity, we'll return the full list or map it if we want to save bandwidth.
        const summary = projects.map(p => {
            const { chatHistory, files, ...rest } = p;
            return rest;
        });
        res.json(summary);
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server Error");
    }
});

// Get specific Project details
router.get("/:projectId", auth, async (req, res) => {
    try {
        const project = await Project.findById(req.params.projectId);
        if (!project) return res.status(404).json({ msg: "Project not found" });

        const workspace = await Workspace.findById(project.workspaceId);
        if (!workspace || !workspace.members.includes(req.user.id)) {
            return res.status(401).json({ msg: "Unauthorized" });
        }

        res.json(project);
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server Error");
    }
});

// Sync/Save Project Files
router.put("/:projectId/files", auth, async (req, res) => {
    try {
        const { files } = req.body;
        const project = await Project.findById(req.params.projectId);

        if (!project) return res.status(404).json({ msg: "Project not found" });

        const workspace = await Workspace.findById(project.workspaceId);
        if (!workspace || !workspace.members.includes(req.user.id)) {
            return res.status(401).json({ msg: "Unauthorized" });
        }

        const updatedProject = await Project.save(req.params.projectId, { ...project, files });

        res.json(updatedProject);
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server Error");
    }
});

module.exports = router;

