import express from "express";
const router = express.Router();
import auth from "../middleware/auth.js";
import { authorizeProject } from "../middleware/projectAccess.js";
import gitService from "../services/gitService.js";
import Project from "../models/Project.js";
import User from "../models/user.js";
import { getGeminiModel } from "../services/geminiService.js";


// GET /api/git/:projectId/history
router.get("/:projectId/history", auth, authorizeProject, async (req, res) => {
    try {
        const history = await gitService.getHistory(req.params.projectId);
        res.json(history);
    } catch (err) {
        console.error("Git History Fetch Error", err);
        res.status(500).json({ error: "Failed to fetch project git history." });
    }
});

// POST /api/git/:projectId/commit
router.post("/:projectId/commit", auth, authorizeProject, async (req, res) => {
    const { message } = req.body || {};
    if (typeof message !== "string" || !message.trim() || message.length > 500) return res.status(400).json({ error: "A commit message (1–500 characters) is required." });
    try {
        const user = await User.findById(req.user.id);
        const authorName = user ? user.username : 'Developer';

        // Step 1: Execute Native Git Commit
        const commitResult = await gitService.commitCode(req.params.projectId, message, authorName);

        // Record only commits actually created by the isolated local repository.
        let project = await Project.findById(req.params.projectId);
        if (commitResult.committed) {
            project = await Project.save(req.params.projectId, { commits: [...(project.commits || []).slice(-99), { sha: commitResult.commitId, at: new Date().toISOString() }] });
        }
        // Step 2: Automatic AI Code Review
        let aiReview = null;
        let reviewStatus = "not-requested";

        if (commitResult.committed && project && process.env.GEMINI_API_KEY) {
            try {
                const model = getGeminiModel();
                const prompt = `You are a Senior Staff Engineer doing a code review on a recent commit.
                The developer committed the following project files.
                Project Context:\n${project.files.map(f => `--- ${f.name} ---\n${f.content}\n`).join('\n').slice(0, 60_000)}
                
                Please provide a highly concise, 2-paragraph maximum code review praising strengths and pointing out 1 potential security or performance risk. Do not output markdown code blocks.`;

                const aiResult = await model.generateContent(prompt);
                aiReview = aiResult.response.text();
                if (!aiReview?.trim() || aiReview.length > 10_000) throw new Error("Invalid AI review.");
                reviewStatus = "completed";

                // Save AI Review back to Chat History
                const chatHistory = project.chatHistory || [];
                chatHistory.push(
                    { role: 'user', content: `[SYSTEM_COMMIT_HOOK] Execute Code Review on latest commit.`, timestamp: new Date() },
                    { role: 'model', content: `**Code Review (${commitResult.commitId || 'latest'}):**\n${aiReview}`, timestamp: new Date() }
                );
                await Project.appendChat(req.params.projectId, chatHistory.slice(-2));
            } catch (aiErr) {
                console.error("AI review failed:", aiErr.code || "PROVIDER_ERROR");
                aiReview = null; reviewStatus = "failed";
            }
        }

        res.json({ ...commitResult, aiReview, reviewStatus });
    } catch (err) {
        console.error("Git Commit Action Error", err);
        res.status(500).json({ error: "Failed to execute git commit action." });
    }
});

export default router;