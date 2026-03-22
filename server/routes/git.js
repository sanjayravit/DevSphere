const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const gitService = require("../services/gitService");
const Project = require("../models/Project");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "dummy_key");

// GET /api/git/:projectId/history
router.get("/:projectId/history", auth, async (req, res) => {
    try {
        const history = await gitService.getHistory(req.params.projectId);
        res.json(history);
    } catch (err) {
        console.error("Git History Fetch Error", err);
        res.status(500).json({ error: "Failed to fetch project git history." });
    }
});

// POST /api/git/:projectId/commit
router.post("/:projectId/commit", auth, async (req, res) => {
    const { message } = req.body;
    try {
        const User = require("../models/user");
        const user = await User.findById(req.user.id);
        const authorName = user ? user.username : 'Developer';

        // Step 1: Execute Native Git Commit
        const commitResult = await gitService.commitCode(req.params.projectId, message, authorName);

        // Step 2: Automatic AI Code Review
        const project = await Project.findById(req.params.projectId);
        let aiReview = "No review generated.";

        if (commitResult.committed && project && process.env.GEMINI_API_KEY) {
            try {
                const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
                const prompt = `You are a Senior Staff Engineer doing a code review on a recent commit.
                The developer committed the following project files.
                Project Context:\n${project.files.map(f => `--- ${f.name} ---\n${f.content}\n`).join('\n')}
                
                Please provide a highly concise, 2-paragraph maximum code review praising strengths and pointing out 1 potential security or performance risk. Do not output markdown code blocks.`;

                const aiResult = await model.generateContent(prompt);
                aiReview = aiResult.response.text();

                // Save AI Review back to Chat History
                project.chatHistory.push(
                    { role: 'user', content: `[SYSTEM_COMMIT_HOOK] Execute Code Review on latest commit.` },
                    { role: 'model', content: `**Code Review (${commitResult.commitId || 'latest'}):**\n${aiReview}` }
                );
                await project.save();
            } catch (aiErr) {
                console.error("AI Review Error:", aiErr);
                aiReview = "AI Code Review failed due to LLM error.";
            }
        }

        res.json({ ...commitResult, aiReview });
    } catch (err) {
        console.error("Git Commit Action Error", err);
        res.status(500).json({ error: "Failed to execute git commit action." });
    }
});

module.exports = router;
