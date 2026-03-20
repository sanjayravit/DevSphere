import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { AnimatedCard } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { MessageSquare, Heart, Share2, Send } from 'lucide-react';

export const SocialFeedPage = () => {
    const { user } = useAuth();
    const [posts, setPosts] = useState([]);
    const [newPost, setNewPost] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchPosts();
    }, []);

    const fetchPosts = async () => {
        try {
            const res = await api.get('/posts').catch(() => ({ data: [] }));
            setPosts(res.data || []);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleCreatePost = async (e) => {
        e.preventDefault();
        if (!newPost.trim()) return;

        try {
            const res = await api.post('/posts', {
                userId: user?._id || user?.id || 'anonymous',
                text: newPost,
                likes: [],
            });
            setPosts([res.data, ...posts]);
            setNewPost('');
        } catch (err) {
            console.error(err);
        }
    };

    return (
        <div className="max-w-3xl mx-auto space-y-8 pb-20">
            <div className="mb-8">
                <h1 className="text-3xl font-display font-bold text-white mb-2">Developer Feed</h1>
                <p className="text-gray-400">Share updates, ask questions, and connect with other developers.</p>
            </div>

            {/* Create Post */}
            <AnimatedCard className="border border-primary-500/20 shadow-[0_0_30px_rgba(99,102,241,0.05)]">
                <form onSubmit={handleCreatePost}>
                    <div className="flex gap-4">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-primary-500 to-accent-purple flex items-center justify-center shrink-0 text-white font-bold uppercase mt-1">
                            {user?.name?.[0] || 'D'}
                        </div>
                        <div className="flex-1 space-y-4">
                            <textarea
                                value={newPost}
                                onChange={(e) => setNewPost(e.target.value)}
                                placeholder="What are you working on right now?"
                                className="w-full bg-transparent border-none focus:ring-0 text-white placeholder:text-gray-500 resize-none h-24 text-lg"
                            />
                            <div className="flex justify-between items-center border-t border-white/10 pt-4">
                                <div className="flex gap-2 text-gray-400">
                                    {/* Additional tools like image upload could go here */}
                                </div>
                                <Button type="submit" size="sm" className="gap-2 px-6 rounded-full">
                                    <Send size={16} /> Post
                                </Button>
                            </div>
                        </div>
                    </div>
                </form>
            </AnimatedCard>

            {/* Posts Feed */}
            <div className="space-y-6">
                {loading ? (
                    <div className="space-y-4">
                        {[1, 2, 3].map(i => (
                            <AnimatedCard key={i} delay={i * 0.1} className="h-40 animate-pulse bg-white/5 border-none" />
                        ))}
                    </div>
                ) : posts.length > 0 ? (
                    posts.map((post, i) => (
                        <AnimatedCard key={post._id || i} delay={0.1 * (i % 5)} className="hover:border-white/10 transition-colors">
                            <div className="flex gap-4 mb-4">
                                <div className="w-10 h-10 rounded-full bg-dark-700 flex items-center justify-center border border-white/10 shrink-0 text-gray-400 uppercase font-medium">
                                    {typeof post.userId === 'string' ? post.userId[0] : 'U'}
                                </div>
                                <div>
                                    <h4 className="text-white font-medium">{post.userId}</h4>
                                    <p className="text-xs text-gray-500">Just now</p>
                                </div>
                            </div>

                            <p className="text-gray-300 whitespace-pre-wrap leading-relaxed mb-6 font-inter">
                                {post.text}
                            </p>

                            <div className="flex items-center gap-6 text-sm text-gray-400 border-t border-white/5 pt-4">
                                <button className="flex items-center gap-2 hover:text-red-400 transition-colors group">
                                    <Heart size={18} className="transition-transform group-hover:scale-110" />
                                    {post.likes?.length || 0}
                                </button>
                                <button className="flex items-center gap-2 hover:text-primary-400 transition-colors">
                                    <MessageSquare size={18} /> 0
                                </button>
                                <button className="flex items-center gap-2 hover:text-white transition-colors ml-auto">
                                    <Share2 size={18} />
                                </button>
                            </div>
                        </AnimatedCard>
                    ))
                ) : (
                    <div className="text-center py-20 text-gray-500 border border-dashed border-white/10 rounded-2xl">
                        No posts yet. Be the first to share something!
                    </div>
                )}
            </div>
        </div>
    );
};
