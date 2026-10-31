import express from "express";
const router = express.Router();
import User from "../models/user.js";
router.get("/:id", async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ msg: "User not found" });
  delete user.password;
  res.json(user);
});

export default router;