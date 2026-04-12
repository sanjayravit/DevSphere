const express = require("express");
const router = express.Router();
const errorAgent = require("../agents/errorAgent");
const fixAgent = require("../agents/fixAgent");
const githubService = require("../services/githubService");
const firebaseService = require("../services/firebaseService");
const socketHandler = require("../sockets/socketHandler");

router.post("/", async (req, res) => {
    try {
        const event = req.headers['x-github-event'];
        const payload = req.body;

        console.log(`[Webhook] Received Event: ${event}`);

        // Acknowledge receipt immediately to avoid GitHub timeout
        res.status(200).json({ status: "received", event });

        // MVP: Handle push events or simulated webhook triggers
        if (event === "push" || !event) {
            const repoName = payload.repository?.full_name || "Unknown Repo";
            const projectId = req.query.projectId || "default_project"; // Assume project ID is passed as query param

            // 1. Error Detection
            const mockLogs = "Simulated Error: Cannot read properties of undefined"; // Simulating failing CI logs
            const errorData = errorAgent.detectErrors(payload, mockLogs);

            if (errorData.error && errorData.error !== "No immediate errors detected.") {
                socketHandler.emitGlobalEvent("error_detected", { repo: repoName, ...errorData });

                await firebaseService.logEvent(projectId, {
                    type: "ERROR_DETECTED",
                    repo: repoName,
                    error: errorData.error
                });

                // 2. Fix Generation
                const fixData = await fixAgent.generateFixForError(errorData);

                if (fixData && fixData.fixedCode) {
                    socketHandler.emitGlobalEvent("fix_generated", { repo: repoName, ...fixData });

                    await firebaseService.logEvent(projectId, {
                        type: "FIX_GENERATED",
                        repo: repoName,
                        explanation: fixData.explanation
                    });

                    // 3. GitHub PR Creation
                    const branchName = `auto-fix-${Date.now()}`;
                    const prUrl = await githubService.createPullRequest(repoName, fixData.fixedCode, branchName, "Automated fix by DevSphere");

                    socketHandler.emitGlobalEvent("pr_created", { repo: repoName, prUrl });

                    await firebaseService.logEvent(projectId, {
                        type: "PR_CREATED",
                        repo: repoName,
                        prUrl: prUrl
                    });
                }
            }
        }
    } catch (error) {
        console.error("Webhook processing error:", error);
    }
});

module.exports = router;
