const router = require("express").Router();
const Post = require("../models/Post");
const auth = require("../middleware/auth");

// Create post
router.post("/", auth, async (req, res) => {
    try {
        const { text, code, language } = req.body;
        const post = new Post({
            author: req.user.id,
            text,
            code,
            language: language || 'javascript'
        });
        await post.save();
        const populatedPost = await post.populate('author', 'username name avatar');
        res.json(populatedPost);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to create post" });
    }
});

// Get all posts
router.get("/", async (req, res) => {
    try {
        const posts = await Post.find()
            .sort({ createdAt: -1 })
            .populate('author', 'username name avatar')
            .populate('comments.user', 'username name avatar');
        res.json(posts);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch posts" });
    }
});

// Like/Unlike post
router.patch("/:id/like", auth, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        if (!post) return res.status(404).json({ error: "Post not found" });

        const index = post.likes.indexOf(req.user.id);
        if (index === -1) {
            post.likes.push(req.user.id);
        } else {
            post.likes.splice(index, 1);
        }

        await post.save();
        res.json({ likes: post.likes });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to update like status" });
    }
});

// Add comment
router.post("/:id/comment", auth, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        if (!post) return res.status(404).json({ error: "Post not found" });

        const comment = {
            user: req.user.id,
            text: req.body.text
        };

        post.comments.push(comment);
        await post.save();

        const updatedPost = await Post.findById(req.params.id).populate('comments.user', 'username name avatar');
        res.json(updatedPost.comments[updatedPost.comments.length - 1]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to add comment" });
    }
});

module.exports = router;
