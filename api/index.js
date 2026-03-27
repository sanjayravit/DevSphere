// Vercel health check and redirect to dashboard
module.exports = async (req, res) => {
    res.status(200).json({
        name: "DevSphere API",
        version: "1.0.0",
        status: "healthy",
        endpoints: [
            "/api/users",
            "/api/auth/user",
            "/api/ai/copilot"
        ]
    });
};
