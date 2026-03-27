try {
    const app = require("../server/server");
    module.exports = app;
} catch (error) {
    console.error("Monolith Startup Error:", error.message);
    module.exports = (req, res) => {
        res.status(500).json({
            error: "Failed to load monolith server",
            details: error.message,
            stack: error.stack
        });
    };
}
