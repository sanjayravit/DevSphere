function detectErrors(commitData, mockLogStr) {
    console.log("[Error Agent] Analyzing commit and logs...");

    let error = "No immediate errors detected.";
    let file = "unknown.js";
    let line = 0;
    let codeStr = "";

    if (mockLogStr) {
        // Regex to find standard JS error patterns: Error: message at file:line:col
        const errorMatch = mockLogStr.match(/(?:Error|TypeError|ReferenceError):\s*([^\n\r]+)/i);
        const locationMatch = mockLogStr.match(/at\s+(?:.*?\s+)?\(?([^:)]+):(\d+):(\d+)\)?/i);

        if (errorMatch) {
            error = errorMatch[1].trim();
        } else if (mockLogStr.toLowerCase().includes("error")) {
            // Fallback for non-standard log strings
            error = mockLogStr.split('\n')[0].substring(0, 200);
        }

        if (locationMatch) {
            file = locationMatch[1].split(/[/\\]/).pop(); // Just get the filename
            line = parseInt(locationMatch[2], 10);
        }

        // In a real system, we'd fetch the actual file content here if we have the repo path.
        // For now, we'll keep a generic snippet if we detected an error but couldn't find code.
        if (error !== "No immediate errors detected.") {
            codeStr = `// Potential issue detected at ${file}:${line}\n// Log source snippet: ${mockLogStr.substring(0, 100)}...`;
        }
    }

    return { error, file, line, codeSnippet: codeStr };
}

module.exports = { detectErrors };
