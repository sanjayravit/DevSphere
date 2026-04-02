const { admin } = require("./firebaseAdmin");

module.exports = async (req, res) => {
    // CORS Headers
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');

    const envKeys = Object.keys(process.env).filter(k =>
        k.includes('FIREBASE') || k.includes('JWT') || k.includes('GEMINI')
    );

    res.json({
        status: "alive",
        firebaseApps: admin.apps.length,
        availableEnvKeys: envKeys,
        nodeEnv: process.env.NODE_ENV,
        timestamp: new Date().toISOString()
    });
};
