const router = require("express").Router();
const Post = require("../models/Post");
const User = require("../models/user");
const auth = require("../middleware/auth");

// Create post
router.post("/", auth, async (req, res) => {
    try {
        const { text, code, language } = req.body;
        const post = await Post.create({
            author: req.user.id,
            text,
            code,
            language: language || 'javascript',
            likes: [],
            comments: []
        });

        const author = await User.findById(req.user.id);
        const populatedPost = {
            ...post,
            author: author ? { username: author.username, name: author.name, avatar: author.avatar } : post.author
        };
        res.json(populatedPost);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to create post" });
    }
});

// Get all posts
router.get("/", async (req, res) => {
    try {
        const posts = await Post.findAll();

        // Manual population for author and comment users
        const populatedPosts = await Promise.all(posts.map(async p => {
            const author = await User.findById(p.author);
            const populatedComments = await Promise.all((p.comments || []).map(async c => {
                const commentUser = await User.findById(c.user);
                return {
                    ...c,
                    user: commentUser ? { username: commentUser.username, name: commentUser.name, avatar: commentUser.avatar } : c.user
                };
            }));

            return {
                ...p,
                author: author ? { username: author.username, name: author.name, avatar: author.avatar } : p.author,
                comments: populatedComments
            };
        }));

        res.json(populatedPosts);
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

        const likes = post.likes || [];
        const index = likes.indexOf(req.user.id);
        if (index === -1) {
            likes.push(req.user.id);
        } else {
            likes.splice(index, 1);
        }

        await Post.save(req.params.id, { ...post, likes });
        res.json({ likes });
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

        const comments = post.comments || [];
        const comment = {
            user: req.user.id,
            text: req.body.text,
            createdAt: new Date().toISOString()
        };

        comments.push(comment);
        await Post.save(req.params.id, { ...post, comments });

        const commentUser = await User.findById(req.user.id);
        res.json({
            ...comment,
            user: commentUser ? { username: commentUser.username, name: commentUser.name, avatar: commentUser.avatar } : req.user.id
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to add comment" });
    }
});

module.exports = router;

