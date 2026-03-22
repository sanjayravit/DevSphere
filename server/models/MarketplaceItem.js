const mongoose = require("mongoose");

const MarketplaceItemSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String, required: true },
    type: { type: String, enum: ['template', 'snippet', 'prompt'], required: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    authorName: { type: String },

    // For 'template' or 'snippet'
    files: [{
        name: { type: String },
        content: { type: String },
        language: { type: String }
    }],

    // For 'prompt'
    promptString: { type: String },

    downloads: { type: Number, default: 0 },
    tags: [{ type: String }]
}, { timestamps: true });

module.exports = mongoose.model("MarketplaceItem", MarketplaceItemSchema);
