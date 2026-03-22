const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const Workspace = require("../models/Workspace");

// Create Workspace
router.post("/", auth, async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) return res.status(400).json({ msg: "Workspace name is required" });

        const workspace = new Workspace({
            name,
            owner: req.user.id,
            members: [req.user.id]
        });

        await workspace.save();
        res.json(workspace);
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server Error");
    }
});

// Get User Workspaces
router.get("/", auth, async (req, res) => {
    try {
        const workspaces = await Workspace.find({
            members: req.user.id
        }).populate("owner", "username email");
        res.json(workspaces);
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server Error");
    }
});

module.exports = router;
