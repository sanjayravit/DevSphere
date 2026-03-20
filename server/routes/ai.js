const router = require("express").Router();

router.post("/resume", async (req, res) => {
  const text = req.body.text;

  // send to AI API (Gemini/OpenAI)
  res.json({ message: "AI analysis here" });
});

module.exports = router;

router.post("/code-help", async (req, res) => {
  const code = req.body.code;

  res.json({ suggestion: "Improve this function..." });
});