const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const Workspace = require("../models/Workspace");
const User = require("../models/user");

// Create Workspace
router.post("/", auth, async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) return res.status(400).json({ msg: "Workspace name is required" });

        const workspace = await Workspace.create({
            name,
            owner: req.user.id,
            members: [req.user.id]
        });

        res.json(workspace);
    } catch (err) {
        console.error("Workspace Creation Error:", err);
        res.status(500).json({
            error: "Failed to create workspace",
            message: err.message,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
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
        res.status(500).json({ error: "Server Error" });
    }
});

module.exports = router;

