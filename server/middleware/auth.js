const jwt = require("jsonwebtoken");

module.exports = function (req, res, next) {
    const authHeader = req.header("Authorization");
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
        return res.status(401).json({ msg: "No token, authorization denied" });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || "fallback_dev_secret");
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
