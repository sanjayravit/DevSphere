const { GoogleGenerativeAI } = require("@google/generative-ai");

async function generateFix(errorMessage, codeSnippet, pastContext = "") {
    if (!process.env.GEMINI_API_KEY) {
        console.warn("GEMINI_API_KEY not set. Cannot generate fix.");
        return { fixedCode: null, explanation: "API key missing" };
    }

    try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        const prompt = `
You are an expert AI developer. You need to fix a bug in the following code.
Error Message:
${errorMessage}

Code Snippet:
${codeSnippet}
${pastContext ? `\nConsider these past alignments and explanations for similar issues:\n${pastContext}\n` : ""}

Provide the fixed code and a brief explanation. Return ONLY a JSON object in this exact format, with no markdown formatting around it:
{
  "fixedCode": "...",
  "explanation": "..."
}
`;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text();

        // Clean JSON formatting if present
        let cleanJson = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
        const jsonResponse = JSON.parse(cleanJson);

        return jsonResponse;
    } catch (error) {
        console.error("Error generating fix with AI:", error);
        return { fixedCode: null, explanation: "AI generation failed." };
    }
}

module.exports = { generateFix };
