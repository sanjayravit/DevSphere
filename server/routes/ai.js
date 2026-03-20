const router = require("express").Router();
const multer = require("multer");
const { streamText } = require("ai");
const { createGoogleGenerativeAI } = require("@ai-sdk/google");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const upload = multer({ storage: multer.memoryStorage() });

const pdfParse = require("pdf-parse");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "dummy_key_to_prevent_crash");

const analyzeResumeWithGemini = async (text) => {
    if (!process.env.GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY is missing. Please add it to your server/.env file.");
    }

    const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
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

router.post("/code-help", async (req, res) => {
    // Vercel AI SDK useCompletion sends the text as `prompt`, not `code`.
    const { action, prompt } = req.body;
    const code = prompt; // Alias for our logic

    if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: "Configuration Error: The server is missing the GEMINI_API_KEY environment variable. Please add it to server/.env to enable the DevSphere AI Co-pilot." });
    }

    try {
        const customGoogle = createGoogleGenerativeAI({
            apiKey: process.env.GEMINI_API_KEY
        });
        const promptContexts = {
            'explain': "You are an expert Software Engineer AI. Explain the functionality of the following code logically and concisely. DO NOT find bugs, and DO NOT suggest optimizations. Focus strictly on explaining what the code currently does.",
            'fix': "You are a strict code review AI. Analyze the following code strictly for bugs, errors, or vulnerabilities. Point out the bugs clearly and provide the corrected code. Do NOT explain the general functionality.",
            'optimize': "You are an automated code solver AI. Refactor and optimize the following code to eliminate all errors and ensure it works perfectly. Provide ONLY the finalized, fully working code. Do NOT include any conversational text, explanations, or markdown code block syntax (like ```javascript). Return ONLY the raw code."
        };

        const instruction = promptContexts[action] || "Please analyze and assist with the following code snippet:";
        const finalPrompt = `Code to analyze:\n\`\`\`\n${code}\n\`\`\`\n\nPlease format your response in clean Markdown.`;

        const result = streamText({
            model: customGoogle('gemini-1.5-flash'), // Reverting to native 1.5 since 2.5 is unstable
            system: instruction,
            prompt: finalPrompt,
        });

        res.writeHead(200, {
            'Content-Type': 'text/plain; charset=utf-8',
            'Transfer-Encoding': 'chunked',
            'Cache-Control': 'no-cache'
        });

        // Native AsyncIterable chunk streaming (bypassing the missing pipe wrapper functions)
        for await (const chunk of result.textStream) {
            res.write(chunk);
        }
        res.end();
    } catch (error) {
        console.error("Gemini AI API Error:", error);
        res.status(500).json({ error: `AI Service Error: ${error.message}. Please verify your API key and network connection.` });
    }
});

module.exports = router;