const express = require("express");
const router = express.Router();
const multer = require("multer");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const auth = require("../middleware/auth");
const Project = require("../models/Project");
const Workspace = require("../models/Workspace");

const upload = multer({ storage: multer.memoryStorage() });

// Vercel Serverless Polyfills for pdf-parse (canvas-free)
if (typeof global.DOMMatrix === "undefined") {
    global.DOMMatrix = class DOMMatrix { };
}
if (typeof global.ImageData === "undefined") {
    global.ImageData = class ImageData { };
}
if (typeof global.Path2D === "undefined") {
    global.Path2D = class Path2D { };
}

const pdfParse = require("pdf-parse");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "dummy_key_to_prevent_crash");

const analyzeResumeWithGemini = async (text) => {
    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "dummy_key_to_prevent_crash" || process.env.GEMINI_API_KEY === "your_actual_api_key_here") {
        throw new Error("GEMINI_API_KEY is missing. Please add it to your server/.env file.");
    }

    const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash",
        generationConfig: { responseMimeType: "application/json" }
    });

    const prompt = `You are a world-class Fortune 500 ATS (Applicant Tracking System) and Senior Recruiter. 
Analyze the following resume text strictly and thoroughly. 
Critique their metrics, action verbs, formatting, and overall impact.

Return EXACTLY a JSON structure matching this format, with no markdown formatting around it:
{
  "score": <number between 0 and 100>,
  "summary": "<2-3 sentence professional summary of their overall profile and biggest weak point>",
  "strengths": ["<strength 1>", "<strength 2>", "<strength 3>"],
  "improvements": ["<actionable advice 1>", "<actionable advice 2>", "<actionable advice 3>"]
}

Resume Text:
${text}
`;

    const result = await model.generateContent(prompt);
    return JSON.parse(result.response.text());
};

router.post("/resume-upload", upload.single("file"), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No file uploaded" });

        let text = "";
        const ext = req.file.originalname.split('.').pop().toLowerCase();

        if (ext === "pdf") {
            const data = await pdfParse(req.file.buffer);
            text = data.text;
        } else if (ext === "txt") {
            text = req.file.buffer.toString("utf-8");
        } else {
            return res.status(400).json({ error: "Unsupported file type. Upload PDF or TXT." });
        }

        const analysis = await analyzeResumeWithGemini(text);
        res.json(analysis);

    } catch (error) {
        console.error("Resume parse/AI error:", error);
        res.status(500).json({ error: error.message || "Failed to analyze document." });
    }
});

router.post("/resume", async (req, res) => {
    try {
        const text = req.body.text;
        if (!text) return res.status(400).json({ error: "No text provided" });

        const analysis = await analyzeResumeWithGemini(text);
        res.json(analysis);
    } catch (error) {
        console.error("Resume parse/AI error:", error);
        res.status(500).json({ error: error.message || "Failed to analyze document." });
    }
});

router.post("/copilot", auth, async (req, res) => {
    const { action, code, projectId, message, targetLanguage } = req.body;

    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "dummy_key_to_prevent_crash" || process.env.GEMINI_API_KEY === "your_actual_api_key_here") {
        return res.status(500).json({ error: "Configuration Error: GEMINI_API_KEY is missing in server/.env" });
    }

    try {
        let history = [];
        let project = null;

        // Pull persistent project chat history for Gemini memory
        if (projectId) {
            project = await Project.findById(projectId);
            if (!project) return res.status(404).json({ error: "Project not found" });

            const workspace = await Workspace.findById(project.workspaceId);
            if (!workspace || !workspace.members.includes(req.user.id)) {
                return res.status(401).json({ error: "Unauthorized access to this workspace project" });
            }

            history = (project.chatHistory || []).map(msg => ({
                role: msg.role === 'user' ? 'user' : 'model',
                parts: [{ text: msg.content }]
            }));
        }

        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        let instruction = "";
        if (action === "explain") {
            instruction = "Explain this code clearly for a developer. Do NOT include bug fixing or optimization.";
        } else if (action === "bugs") {
            instruction = "Find bugs and issues in this code and explain them. Do NOT explain the full code.";
        } else if (action === "optimize") {
            instruction = "Optimize this code, fix errors, and return improved version only. Do NOT include conversational text or markdown code blocks like ```javascript.";
        } else if (action === "chat") {
            instruction = `The user is asking a direct question regarding the code context. Question: ${message}`;
        } else if (action === "project-query") {
            instruction = `The user is querying the ENTIRE CODEBASE architecture. Answer their question: ${message}\n\nProject Files Reference Matrix:\n${project?.files?.map(f => `--- File: ${f.name} ---\n${f.content}\n`).join('\n') || 'No files found.'}`;
        } else if (action === "lint") {
            const schema = `[{"line": 5, "message": "Expected comma"}]`;
            instruction = `Analyze this code for syntax errors and obvious logic bugs. Return EXACTLY a raw JSON array matching this schema: ${schema}. If perfect, return []. Do NOT output markdown ticks or conversational text.`;
        } else if (action === "continue") {
            instruction = "Look at the context of this code and explicitly generate the next logical lines or functions. ONLY return the new code to append, do not output conversational text or markdown blocks like ```javascript.";
        } else if (action === "refactor") {
            instruction = "Refactor this entire file to achieve better performance, readability, and modern styling. Return ONLY the refactored code without markdown blocks like ```javascript.";
        } else if (action === "convert") {
            instruction = `Convert this code to ${req.body.targetLanguage || 'a modern format'}. Return ONLY the converted code without markdown blocks like \`\`\`javascript.`;
        } else {
            instruction = "Analyze this code.";
        }

        const finalPrompt = `${instruction} \n\nCode State: \n${code} `;

        // Feed historical persistence arrays into Gemini
        const chat = model.startChat({ history });

        const result = await chat.sendMessage([{ text: finalPrompt }]);
        const responseText = result.response.text();

        // Record backend interaction layer in the DB memory arrays
        if (project) {
            const chatHistory = project.chatHistory || [];
            chatHistory.push(
                { role: 'user', content: finalPrompt, timestamp: new Date() },
                { role: 'model', content: responseText, timestamp: new Date() }
            );
            await Project.save(projectId, { ...project, chatHistory });
        }

        res.json({ result: responseText });
    } catch (error) {
        console.error("Copilot AI Error:", error);
        res.status(500).json({ error: "Failed to generate AI response. Check your API key." });
    }
});

module.exports = router;
