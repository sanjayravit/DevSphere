const router = require("express").Router();
const axios = require("axios");

router.post("/run", async (req, res) => {
  const response = await axios.post("https://judge0-ce.p.rapidapi.com/submissions", {
    source_code: req.body.code,
    language_id: 71
  });

  res.json(response.data);
});

module.exports = router;