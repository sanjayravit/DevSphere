const aiService = require('../services/aiService');

async function generateFixForError(errorData) {
    console.log("[Fix Agent] Generating fix for error...", errorData.error);

    if (!errorData.error || errorData.error === "No immediate errors detected.") {
        return null; // No fix needed
    }

    const aiResponse = await aiService.generateFix(errorData.error, errorData.codeSnippet);

    return {
        ...errorData,
        fixedCode: aiResponse.fixedCode,
        explanation: aiResponse.explanation
    };
}

module.exports = { generateFixForError };
