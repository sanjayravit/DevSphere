process.on('uncaughtException', (err) => {
    console.error("FATAL UNCAUGHT:", err);
    process.exit(1);
});

try {
    console.log("Loading module...");
    const app = require('./api/index.js');
    console.log("Module loaded successfully!", typeof app);
    if (app && typeof app.listen === 'function') {
        app.listen(0, () => {
            console.log("App listens successfully.");
            process.exit(0);
        });
    } else {
        console.log("App is not an express instance?");
    }
} catch (e) {
    console.error("Caught synchronous error during require:", e);
}
