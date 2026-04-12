const { GoogleGenerativeAI } = require("@google/generative-ai");
const jwt = require("jsonwebtoken");
const { db } = require("../../server/firebaseAdmin");
const Project = require("../../server/models/Project");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "dummy_key_to_prevent_crash");

module.exports = async (req, res) => {
    // Handle OPTIONS for CORS
    if (req.method === "OPTIONS") { return res.status(200).end(); }
    if (req.method !== "POST") { return res.status(405).json({ error: "Method not allowed" }); }

    const authHeader = req.headers.authorization || req.headers.Authorization;
    const token = authHeader && authHeader.split(" ")[1];
    if (!token) return res.status(401).json({ msg: "No token, authorization denied" });

    let user;
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || "fallback_dev_secret");
        user = decoded.user || decoded;
        if (!user || !user.id) throw new Error("Invalid token payload");
    } catch (err) {
        return res.status(401).json({ msg: "Token is not valid" });
    }

    const { action, code, projectId, message } = req.body;

    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY.includes("dummy") || process.env.GEMINI_API_KEY.includes("your_actual")) {
        return res.status(500).json({ error: "Configuration Error: GEMINI_API_KEY is missing." });
    }

    try {
        let history = [];
        let project = null;

        if (projectId) {
            project = await Project.findById(projectId);
            if (!project) return res.status(404).json({ error: "Project not found" });

            // Ensure database is connected
            if (db) {
                const aiChatsSnapshot = await db.collection("aiChats").where("projectId", "==", projectId).orderBy("timestamp", "asc").limit(50).get();
                aiChatsSnapshot.forEach(doc => {
                    const msg = doc.data();
                    history.push({
                        role: msg.role === 'user' ? 'user' : 'model',
                        parts: [{ text: msg.content }]
                    });
                });
            }
        }

        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        let instruction = "Analyze this code.";
        if (action === "explain") {
            instruction = "Explain this code clearly for a developer. Keep it clean and avoid markdown blocks wrapping the entire response if possible.";
        } else if (action === "fix" || action === "bugs") {
            instruction = "Find bugs and issues in this code and fix them. Return ONLY the fixed code without markdown blocks like ```javascript.";
        } else if (action === "optimize") {
            instruction = "Optimize this code to improve performance and readability. Return ONLY the improved code without markdown blocks.";
        } else if (action === "chat") {
            instruction = `The user is asking a direct question regarding the code context. Question: ${message}`;
        }

        const finalPrompt = `${instruction} \n\nCode State: \n${code} `;

        let responseText = "";

        if (action === "chat") {
            const chat = model.startChat({ history });
            const result = await chat.sendMessage([{ text: finalPrompt }]);
            responseText = result.response.text();
        } else {
            const result = await model.generateContent(finalPrompt);
            responseText = result.response.text();

            // Clean up backticks if AI ignores prompt instructions
            if (action === "fix" || action === "optimize") {
                responseText = responseText.replace(/^\`\`\`.*\n/, '').replace(/\n\`\`\`$/, '').trim();
            }
        }

        // Save interaction to Firestore aiChats collection
        if (projectId && db) {
            const now = new Date();
            await db.collection("aiChats").add({
                projectId,
                role: 'user',
                content: finalPrompt,
                timestamp: now
            });
            await db.collection("aiChats").add({
                projectId,
                role: 'model',
                content: responseText,
                timestamp: new Date(now.getTime() + 1000) // slight offset
            });
        }

        res.json({ result: responseText });
    } catch (error) {
        console.error("Agent AI Error:", error);
        res.status(500).json({ error: "Failed to generate AI response. Check your API key or logs." });
    }
};
