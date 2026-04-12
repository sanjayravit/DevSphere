const jwt = require("jsonwebtoken");

module.exports = function (req, res, next) {
    const authHeader = req.header("Authorization");
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
        return res.status(401).json({ msg: "No token, authorization denied" });
    }

    try {
        const secret = process.env.JWT_SECRET;
        if (!secret && process.env.NODE_ENV === 'production') {
            return res.status(500).json({ msg: "Server configuration error: JWT_SECRET missing" });
        }

        const decoded = jwt.verify(token, secret || "fallback_dev_secret");
        // Robustly handle both { user: { id } } and direct { id } payloads
        const userPayload = decoded.user || decoded;

        if (!userPayload || !userPayload.id) {
            return res.status(401).json({ msg: "Token payload is malformed" });
        }

        req.user = userPayload;
        return next();
    } catch (err) {
        return res.status(401).json({ msg: "Token is not valid" });
    }
};
