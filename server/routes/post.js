const router = require("express").Router();
const Post = require("../models/Post");

// Create post
router.post("/", async (req, res) => {
    const post = new Post(req.body);
    await post.save();
    res.json(post);
});

// Get all posts
router.get("/", async (req, res) => {
    const posts = await Post.find();
    res.json(posts);
});

module.exports = router;
