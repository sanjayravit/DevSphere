const router = require("express").Router();
const User = require("../models/user");

router.get("/:id", async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ msg: "User not found" });
  delete user.password;
  res.json(user);
});

module.exports = router;
