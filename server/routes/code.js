const router = require("express").Router();
const axios = require("axios");

// Map Judge0 IDs to Wandbox compiler configs
const WANDBOX_COMPILERS = {
  63: "nodejs-20.17.0",
  71: "cpython-3.14.0",
  62: "openjdk-jdk-22+36",
  54: "gcc-13.2.0-cpp",
  50: "gcc-13.2.0-c"
};

router.post("/run", async (req, res) => {
  try {
    const langId = req.body.language_id || 63;
    const compiler = WANDBOX_COMPILERS[langId] || "nodejs-20.17.0";

    const response = await axios.post("https://wandbox.org/api/compile.json", {
      code: req.body.code,
      compiler: compiler,
      save: false
    });

    res.json({
      stdout: response.data.program_message || "",
      stderr: response.data.program_error || "",
      compile_output: response.data.compiler_error || ""
    });
  } catch (error) {
    console.error("Code Execution Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to execute code", details: error.response?.data || error.message });
  }
});

module.exports = router;