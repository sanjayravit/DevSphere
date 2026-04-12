const { Emitter } = require("@socket.io/redis-emitter");
const Redis = require("ioredis");

let ioInstance = null;
let emitter = null;

// Initialize Redis Emitter if URL is present in ENV
if (process.env.REDIS_URL) {
    try {
        const redisClient = new Redis(process.env.REDIS_URL);
        emitter = new Emitter(redisClient);
        console.log("[Socket Handler] Redis Emitter initialized for cross-process communication");
    } catch (err) {
        console.error("[Socket Handler] Failed to initialize Redis Emitter:", err.message);
    }
}

module.exports = {
    init: (io) => {
        ioInstance = io;
    },
    emitEvent: (roomId, event, data) => {
        if (ioInstance) {
            ioInstance.to(roomId).emit(event, data);
        } else if (emitter) {
            emitter.to(roomId).emit(event, data);
        } else {
            console.warn(`[Socket Handler] No emission channel available for event: ${event}`);
        }
    },
    emitGlobalEvent: (event, data) => {
        if (ioInstance) {
            ioInstance.emit(event, data);
        } else if (emitter) {
            emitter.emit(event, data);
        } else {
            console.warn(`[Socket Handler] No emission channel available for global event: ${event}`);
        }
    }
};
