let ioInstance = null;

module.exports = {
    init: (io) => {
        ioInstance = io;
    },
    emitEvent: (roomId, event, data) => {
        if (ioInstance) {
            ioInstance.to(roomId).emit(event, data);
        } else {
            console.warn("Socket.io not initialized. Cannot emit event:", event);
        }
    },
    emitGlobalEvent: (event, data) => {
        if (ioInstance) {
            ioInstance.emit(event, data);
        } else {
            console.warn("Socket.io not initialized. Cannot emit global event:", event);
        }
    }
};
