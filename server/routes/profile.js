import express from "express";
const router = express.Router();
import User from "../models/user.js";
router.get("/:id", async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ msg: "User not found" });
  const { id, username, name, avatar } = user;
  res.json({ id, username, name, avatar });
});

export default router;