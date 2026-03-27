const { admin, db } = require("../firebaseAdmin");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "dummy");

module.exports = async (req, res) => {
    // CORS Headers
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    const { action, code, projectId, message, targetLanguage } = req.body;

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        let instruction = "";
        if (action === "explain") {
            instruction = "Explain this code clearly for a developer. Do NOT include bug fixing or optimization.";
        } else if (action === "bugs") {
            instruction = "Find bugs and issues in this code and explain them. Do NOT explain the full code.";
        } else if (action === "optimize" || action === "optimise") {
            instruction = "Optimize this code, fix errors, and return improved version only. Do NOT include conversational text or markdown code blocks like ```javascript.";
        } else if (action === "chat") {
            instruction = `The user is asking a direct question regarding the code context. Question: ${message}`;
        } else if (action === "project-query") {
            instruction = `The user is querying the ENTIRE CODEBASE architecture. Answer their question: ${message}`;
        } else if (action === "lint") {
            const schema = `[{"line": 5, "message": "Expected comma"}]`;
            instruction = `Analyze this code for syntax errors and obvious logic bugs. Return EXACTLY a raw JSON array matching this schema: ${schema}. If perfect, return []. Do NOT output markdown ticks or conversational text.`;
        } else if (action === "continue") {
            instruction = "Look at the context of this code and explicitly generate the next logical lines or functions. ONLY return the new code to append, do not output conversational text or markdown blocks like ```javascript.";
        } else if (action === "refactor") {
            instruction = "Refactor this entire file to achieve better performance, readability, and modern styling. Return ONLY the refactored code without markdown blocks like ```javascript.";
        } else if (action === "convert") {
            instruction = `Convert this code to ${targetLanguage || 'a modern format'}. Return ONLY the converted code without markdown blocks like ```javascript.`;
        } else {
            instruction = "Analyze this code.";
        }

        const finalPrompt = `${ instruction } \n\nCode State: \n${ code } `;

        const result = await model.generateContent(finalPrompt);
        const responseText = result.response.text();

        // Record interaction if projectId is provided
        if (projectId && db) {
            const projectRef = db.collection("projects").doc(projectId);
            const chatMsgUser = { role: 'user', content: message || `Action: ${ action } `, timestamp: new Date() };
            const chatMsgAI = { role: 'model', content: responseText, timestamp: new Date() };
            
            await projectRef.update({
                chatHistory: admin.firestore.FieldValue.arrayUnion(chatMsgUser, chatMsgAI)
            }).catch(err => console.error("Firestore Update Error:", err));
        }

        res.json({ result: responseText });
    } catch (error) {
        console.error("AI Error:", error);
        res.status(500).json({ error: "AI generation failed: " + error.message });
    }
};
