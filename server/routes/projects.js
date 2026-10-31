import express from "express";
const router = express.Router();
import auth from "../middleware/auth.js";
import { validateRepositoryPath, validateProjectFiles } from "../utils/repositorySafety.js";
import Workspace from "../models/Workspace.js";
import Project from "../models/Project.js";
import { getGeminiModel } from "../services/geminiService.js";

// AI Scaffolding Helper
const generateScaffoldedCode = async (name, language) => {
    if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured; scaffolding was not generated.");
    try {
        const model = getGeminiModel();
        const prompt = `Generate a well-structured, production-ready starter ${language} project named "${name}".
Include:
- Imports and setup
- A clear main entry point
- 2-3 example functions or classes relevant to the project name
- Comments explaining key sections
Return ONLY the raw code, no markdown blocks.`;
        const result = await model.generateContent(prompt);
        const code = result.response.text();
        if (typeof code !== "string" || !code.trim() || code.length > 200_000) throw new Error("Empty or oversized scaffold response.");
        return code;
    } catch (e) {
        console.error("AI Scaffold Error:", e.message);
        throw new Error("AI scaffolding failed; no project was created.");
    }
};

// Create Project in a Workspace
router.post("/:workspaceId", auth, async (req, res) => {
    try {
        const { name, language = "javascript", generateWithAI = false, initialFileName } = req.body || {};
        if (typeof name !== "string" || !name.trim() || name.length > 100 || typeof language !== "string" || language.length > 40 || typeof generateWithAI !== "boolean" || initialFileName !== undefined && typeof initialFileName !== "string") return res.status(400).json({ error: "Invalid project name, language or scaffolding options." });
        if (initialFileName) { try { validateRepositoryPath(initialFileName); } catch { return res.status(400).json({ error: "Unsafe initial file name." }); } }
        const workspaceId = req.params.workspaceId;

        const workspace = await Workspace.findById(workspaceId);
        if (!workspace || !workspace.members?.includes(req.user.id)) {
            return res.status(404).json({ msg: "Workspace not found or unauthorized" });
        }

        // Determine file extension from language key
        const EXT_MAP = {
            javascript: 'js', typescript: 'ts', python: 'py', java: 'java',
            cpp: 'cpp', c: 'c', csharp: 'cs', go: 'go', ruby: 'rb',
            rust: 'rs', php: 'php', swift: 'swift', kotlin: 'kt',
            html: 'html', css: 'css', shell: 'sh', sql: 'sql',
            json: 'json', markdown: 'md', yaml: 'yaml', xml: 'xml',
        };
        const fileExt = EXT_MAP[language] || 'js';
        // Use client-supplied filename if valid, otherwise fall back to main.<ext>
        const fileName = (initialFileName && initialFileName.trim().includes('.'))
            ? initialFileName.trim()
            : `main.${fileExt}`;

        // AI-powered scaffolding: generate starter code if requested
        let initialContent = ["python", "ruby", "shell", "yaml"].includes(language) ? `# ${name}\n` : language === "json" ? "{}\n" : ["html", "xml"].includes(language) ? `<!-- ${name.replaceAll("--", "")} -->\n` : language === "css" ? "/* New stylesheet */\n" : language === "markdown" ? `# ${name}\n` : language === "sql" ? `-- ${name}\n` : `// ${name}\n`;
        if (generateWithAI) {
            const aiCode = await generateScaffoldedCode(name, language || "javascript");
            initialContent = aiCode;
        }

        const initialFiles = validateProjectFiles([{ name: fileName, content: initialContent, language }]);
        const project = await Project.create({
            name,
            workspaceId,
            files: initialFiles,
            chatHistory: []
        });

        res.json(project);
    } catch (err) {
        console.error("Error creating project:", err);
        res.status(502).json({ error: "Project creation failed; verify the provider configuration." });
    }
});

// Get all Projects in a Workspace (Overview)
router.get("/workspace/:workspaceId", auth, async (req, res) => {
    try {
        const workspaceId = req.params.workspaceId;

        const workspace = await Workspace.findById(workspaceId);
        if (!workspace || !workspace.members?.includes(req.user.id)) {
            return res.status(404).json({ msg: "Workspace not found or unauthorized" });
        }

        const projects = await Project.findByWorkspace(workspaceId);
        // Transform to exclude heavy items for overview if needed, but Firestore returns what you ask for.
        // For simplicity, we'll return the full list or map it if we want to save bandwidth.
        const summary = projects.map(p => {
            const { chatHistory, files, ...rest } = p;
            return { ...rest, fileCount: files?.length || 0 };
        });
        res.json(summary);
    } catch (err) {
        console.error(err.message);
        res.status(err.status || 503).json({ error: err.status ? err.message : "Project service is unavailable." });
    }
});

// Get specific Project details
router.get("/:projectId", auth, async (req, res) => {
    try {
        const project = await Project.findById(req.params.projectId);
        if (!project) return res.status(404).json({ msg: "Project not found" });

        const workspace = await Workspace.findById(project.workspaceId);
        if (!workspace || !workspace.members?.includes(req.user.id)) {
            return res.status(404).json({ error: "Project not found." });
        }

        res.json(project);
    } catch (err) {
        console.error(err.message);
        res.status(err.status || 503).json({ error: err.status ? err.message : "Project service is unavailable." });
    }
});

// Sync/Save Project Files
router.put("/:projectId/files", auth, async (req, res) => {
    try {
        const { files, version } = req.body || {};
        let validated;
        try { validated = validateProjectFiles(files); } catch (error) { return res.status(400).json({ error: error.message }); }
        if (!Number.isInteger(version) || version < 0) return res.status(400).json({ error: "The current project version is required to prevent stale writes." });
        const project = await Project.findById(req.params.projectId);

        if (!project) return res.status(404).json({ msg: "Project not found" });

        const workspace = await Workspace.findById(project.workspaceId);
        if (!workspace || !workspace.members?.includes(req.user.id)) {
            return res.status(404).json({ error: "Project not found." });
        }

        const updatedProject = await Project.save(req.params.projectId, { files: validated }, { expectedVersion: version });

        res.json(updatedProject);
    } catch (err) {
        console.error(err.message);
        res.status(err.status || 503).json({ error: err.status ? err.message : "Project service is unavailable." });
    }
});

export default router;