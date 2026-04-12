const express = require("express");
const router = express.Router();
const errorAgent = require("../agents/errorAgent");
const fixAgent = require("../agents/fixAgent");
const githubService = require("../services/githubService");
const firebaseService = require("../services/firebaseService");
const socketHandler = require("../sockets/socketHandler");
const vercelService = require("../services/vercelService");
const firebaseAdmin = require("../firebaseAdmin");
const crypto = require("crypto");

const verifyGithubSignature = (req) => {
    const signature = req.headers['x-hub-signature-256'];
    if (!signature) return false;
    const secret = process.env.GITHUB_WEBHOOK_SECRET;
    if (!secret) {
        console.warn("GITHUB_WEBHOOK_SECRET not set, skipping verification");
        return true;
    }
    const hmac = crypto.createHmac('sha256', secret);
    const digest = Buffer.from('sha256=' + hmac.update(JSON.stringify(req.body)).digest('hex'), 'utf8');
    const checksum = Buffer.from(signature, 'utf8');
    return checksum.length === digest.length && crypto.timingSafeEqual(digest, checksum);
};

router.get("/history", async (req, res) => {
    try {
        const projectId = req.query.projectId || "default_project";
        if (!firebaseAdmin.db) return res.status(200).json({ events: [] });

        const snapshot = await firebaseAdmin.db.collection('projects').doc(projectId).collection('events')
            .orderBy('timestamp', 'desc')
            .limit(50)
            .get();

        const events = [];
        snapshot.forEach(doc => {
            events.push({ id: doc.id, ...doc.data() });
        });

        res.status(200).json({ events });
    } catch (error) {
        console.error("Error fetching history:", error);
        res.status(500).json({ error: "Failed to fetch event history" });
    }
});

router.post("/", async (req, res) => {
    try {
        const githubEvent = req.headers['x-github-event'];
        const vercelSignature = req.headers['x-vercel-signature'];
        const payload = req.body;

        console.log(`[Webhook] Received Event - GitHub: ${githubEvent}, Vercel: ${!!vercelSignature}`);

        // Security: Verify GitHub Signature
        if (githubEvent && !verifyGithubSignature(req)) {
            console.error("[Webhook] Invalid GitHub signature");
            return res.status(401).json({ error: "Invalid signature" });
        }

        // Acknowledge receipt immediately
        res.status(200).json({ status: "received", githubEvent, vercel: !!vercelSignature });

        const projectId = req.query.projectId || "default_project";

        // Handle Vercel Deployment Webhook
        if (vercelSignature && payload.type && payload.type.startsWith('deployment.')) {
            if (payload.type === 'deployment.error' || payload.type === 'deployment.canceled') {
                const repoName = payload.payload.deployment?.meta?.githubCommitRepo || "Unknown Repo";
                const deploymentId = payload.payload.deployment?.id;

                socketHandler.emitGlobalEvent("deployment_failed", { repo: repoName, deploymentId });

                // Fetch logs
                const logs = await vercelService.getDeploymentLogs(deploymentId);
                const errorData = errorAgent.detectErrors({}, logs);

                if (errorData.error) {
                    socketHandler.emitGlobalEvent("error_detected", { repo: repoName, source: "vercel", ...errorData });

                    await firebaseService.logEvent(projectId, {
                        type: "VERCEL_ERROR_DETECTED",
                        repo: repoName,
                        error: errorData.error,
                        deploymentId
                    });

                    // Follow the fix generation pipeline
                    const fixData = await fixAgent.generateFixForError(errorData, projectId);
                    if (fixData && fixData.fixedCode) {
                        socketHandler.emitGlobalEvent("fix_generated", { repo: repoName, source: "vercel", ...fixData });

                        await firebaseService.logEvent(projectId, {
                            type: "FIX_GENERATED",
                            repo: repoName,
                            errorData: errorData,
                            explanation: fixData.explanation,
                            source: "vercel"
                        });

                        const branchName = `vercel-hotfix-${Date.now()}`;
                        const prUrl = await githubService.createPullRequest(repoName, fixData.fixedCode, branchName, "Automated Vercel deployment fix");

                        socketHandler.emitGlobalEvent("pr_created", { repo: repoName, source: "vercel", prUrl });

                        await firebaseService.logEvent(projectId, {
                            type: "PR_CREATED",
                            repo: repoName,
                            prUrl: prUrl,
                            source: "vercel"
                        });
                    }
                }
            }
            return; // Finished processing Vercel event
        }

        // MVP: Handle GitHub push events or simulated webhook triggers
        if (githubEvent === "push" || !githubEvent) {
            const repoName = payload.repository?.full_name || "Unknown Repo";

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
                const fixData = await fixAgent.generateFixForError(errorData, projectId);

                if (fixData && fixData.fixedCode) {
                    socketHandler.emitGlobalEvent("fix_generated", { repo: repoName, ...fixData });

                    await firebaseService.logEvent(projectId, {
                        type: "FIX_GENERATED",
                        repo: repoName,
                        errorData: errorData,
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
