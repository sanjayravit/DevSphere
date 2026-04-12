const aiService = require('../services/aiService');
const firebaseService = require('../services/firebaseService');

async function generateFixForError(errorData, projectId) {
    console.log("[Fix Agent] Generating fix for error...", errorData.error);

    if (!errorData.error || errorData.error === "No immediate errors detected.") {
        return null; // No fix needed
    }

    // 1. Query Learning System
    const pastFixes = await firebaseService.getPastFixes(projectId, errorData.error);
    let contextStr = "";
    if (pastFixes && pastFixes.length > 0) {
        contextStr = `Prior context from Learning System:\n${pastFixes.join('\n')}`;
        console.log(`[Fix Agent] Retrieved ${pastFixes.length} past insights from Learning System.`);
    }

    // 2. Call AI with combined context
    const aiResponse = await aiService.generateFix(errorData.error, errorData.codeSnippet, contextStr);

    if (!aiResponse || !aiResponse.fixedCode) {
        console.warn("[Fix Agent] AI failed to generate a valid fix.");
        return {
            ...errorData,
            fixedCode: null,
            explanation: aiResponse?.explanation || "AI was unable to propose a reliable fix for this specific error signature."
        };
    }

    return {
        ...errorData,
        fixedCode: aiResponse.fixedCode,
        explanation: aiResponse.explanation
    };
}

module.exports = { generateFixForError };
