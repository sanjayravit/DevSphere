import express from "express";
const router = express.Router();
import auth from "../middleware/auth.js";
import Workspace from "../models/Workspace.js";
import User from "../models/user.js";
// Create Workspace
router.post("/", auth, async (req, res) => {
    try {
        const { name } = req.body || {};
        if (typeof name !== "string" || !name.trim() || name.length > 100) return res.status(400).json({ msg: "Workspace name is required" });

        const workspace = await Workspace.create({
            name: name.trim(),
            owner: req.user.id,
            members: [req.user.id]
        });

        res.json(workspace);
    } catch (err) {
        res.status(err.status || 503).json({ error: "Workspace creation is unavailable." });
    }
});

// Get User Workspaces
router.get("/", auth, async (req, res) => {
    try {
        const workspaces = await Workspace.findByMember(req.user.id);

        // Manual "populate" for owner
        const populatedWorkspaces = await Promise.all(workspaces.map(async w => {
            const owner = await User.findById(w.owner);
            return {
                ...w,
                owner: owner ? { id: owner.id, username: owner.username, email: owner.email } : w.owner
            };
        }));

        res.json(populatedWorkspaces);
    } catch (err) {
        console.error(err.message);
        res.status(err.status || 503).json({ error: "Workspaces are unavailable." });
    }
});

export default router;