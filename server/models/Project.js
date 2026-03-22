const mongoose = require("mongoose");

const FileSchema = new mongoose.Schema({
    name: { type: String, required: true },
    content: { type: String, default: "" },
    language: { type: String, default: "javascript" }
});

const ChatMessageSchema = new mongoose.Schema({
    role: { type: String, enum: ["user", "model"], required: true },
    content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
});

const ProjectSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
    },
    workspaceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Workspace",
        required: true,
        index: true // Index for fast scoping queries
    },
    files: [FileSchema],
    chatHistory: [ChatMessageSchema], // Persistent AI Memory context
    createdAt: {
        type: Date,
        default: Date.now,
    },
    updatedAt: {
        type: Date,
        default: Date.now,
    }
});

// Update the updatedAt timestamp prior to scaling document saves
ProjectSchema.pre('save', async function () {
    this.updatedAt = Date.now();
});

module.exports = mongoose.model("Project", ProjectSchema);
