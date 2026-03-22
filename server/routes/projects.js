const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const Workspace = require("../models/Workspace");
const Project = require("../models/Project");

// Create Project in a Workspace
router.post("/:workspaceId", auth, async (req, res) => {
    try {
        const { name, language } = req.body;
        const workspaceId = req.params.workspaceId;

        const workspace = await Workspace.findOne({ _id: workspaceId, members: req.user.id });
        if (!workspace) return res.status(404).json({ msg: "Workspace not found or unauthorized" });

        // Add default main file extension mapping based on request language
        let fileExt = "js";
        if (language === "python") fileExt = "py";
        if (language === "java") fileExt = "java";
        if (language === "c") fileExt = "c";
        if (language === "cpp") fileExt = "cpp";

        const project = new Project({
            name,
            workspaceId,
            files: [{ name: `main.${fileExt}`, content: "// Welcome to your new startup project\n", language: language || "javascript" }]
        });

        await project.save();
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

        const workspace = await Workspace.findOne({ _id: workspaceId, members: req.user.id });
        if (!workspace) return res.status(404).json({ msg: "Workspace not found or unauthorized" });

        const projects = await Project.find({ workspaceId }).select("-chatHistory -files.content"); // Exclude heavy payloads
        res.json(projects);
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

        const workspace = await Workspace.findOne({ _id: project.workspaceId, members: req.user.id });
        if (!workspace) return res.status(401).json({ msg: "Unauthorized" });

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

        const workspace = await Workspace.findOne({ _id: project.workspaceId, members: req.user.id });
        if (!workspace) return res.status(401).json({ msg: "Unauthorized" });

        project.files = files;
        await project.save();

        res.json(project);
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server Error");
    }
});

module.exports = router;
