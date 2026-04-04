import React, { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { AnimatedCard } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import {
    MessageSquare,
    Heart,
    Share2,
    Send,
    Code2,
    Copy,
    Check,
    MoreHorizontal,
    Terminal,
    Sparkles,
    Trash2
} from 'lucide-react';
import Editor from '@monaco-editor/react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';

const Toast = ({ message, type = 'success', onClose }) => (
    <motion.div
        initial={{ opacity: 0, y: 50, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className={`fixed bottom-8 right-8 z-50 flex items-center gap-3 px-6 py-3 rounded-2xl shadow-2xl backdrop-blur-xl border ${type === 'success' ? 'bg-primary-500/10 border-primary-500/50 text-primary-400' : 'bg-red-500/10 border-red-500/50 text-red-400'
            }`}
    >
        {type === 'success' ? <Check size={18} /> : <Trash2 size={18} />}
        <span className="font-medium">{message}</span>
    </motion.div>
);

const CodeBlock = ({ code, language, isReadOnly = true }) => {
    const [copied, setCopied] = useState(false);
    const [h, setH] = useState(250);

    const handleCopy = () => {
        navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="relative group rounded-xl overflow-hidden border border-white/5 bg-[#0d0d12]">
            <div className="flex items-center justify-between px-4 py-2 bg-dark-800/50 border-b border-white/5">
                <div className="flex items-center gap-2">
                    <Terminal size={12} className="text-gray-500" />
                    <span className="text-[10px] uppercase tracking-widest text-gray-500 font-mono">{language}</span>
                </div>
                <button
                    onClick={handleCopy}
                    className="p-1.5 hover:bg-white/5 rounded-md text-gray-500 hover:text-primary-400 transition-all"
                >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                </button>
            </div>
            <div style={{ height: `${Math.min(h, 500)}px` }} className="transition-all duration-300">
                <Editor
                    height="100%"
                    language={language}
                    value={code}
                    theme="vs-dark"
                    onMount={(editor) => {
                        const count = editor.getModel()?.getLineCount() || 1;
                        setH(count * 19 + 40);
                    }}
                    options={{
                        readOnly: isReadOnly,
                        minimap: { enabled: false },
                        fontSize: 13,
                        fontFamily: 'JetBrains Mono, monospace',
                        lineNumbers: 'on',
                        scrollBeyondLastLine: false,
                        padding: { top: 12, bottom: 12 },
                        folding: true,
                        domReadOnly: true,
                    }}
                />
            </div>
        </div>
    );
};

const BorderBeam = () => (
    <div className="absolute inset-0 pointer-events-none rounded-[inherit] z-0 overflow-hidden">
        <motion.div
            initial={{ rotate: 0 }}
            animate={{ rotate: 360 }}
            transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
            className="absolute -inset-[200%] bg-[conic-gradient(from_0deg,transparent_40%,#6366f1_50%,transparent_60%)] opacity-30 group-focus-within:opacity-100 transition-opacity duration-700"
        />
    </div>
);

export const SocialFeedPage = () => {
    const { user } = useAuth();
    const [posts, setPosts] = useState([]);
    const [newPost, setNewPost] = useState('');
    const [codeSnippet, setCodeSnippet] = useState('');
    const [language, setLanguage] = useState('javascript');
    const [showCodeInput, setShowCodeInput] = useState(false);
    const [loading, setLoading] = useState(true);
    const [posting, setPosting] = useState(false);
    const [toast, setToast] = useState(null);
    const [editorHeight, setEditorHeight] = useState(200);
    const textareaRef = useRef(null);

    useEffect(() => {
        fetchPosts();
    }, []);

    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
        }
    }, [newPost]);

    const handleEditorChange = (value) => {
        setCodeSnippet(value);
    };

    const handleEditorDidMount = (editor) => {
        const updateHeight = () => {
            const contentHeight = editor.getContentHeight();
            setEditorHeight(Math.max(200, Math.min(contentHeight, 600)));
        };
        editor.onDidContentSizeChange(updateHeight);
        updateHeight();
    };

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
        if (!newPost.trim() && !codeSnippet.trim()) return;

        setPosting(true);
        try {
            const res = await api.post('/posts', {
                text: newPost,
                code: showCodeInput ? codeSnippet : '',
                language: showCodeInput ? language : 'javascript'
            });

            setPosts(prev => [res.data, ...prev]);
            setNewPost('');
            setCodeSnippet('');
            setShowCodeInput(false);
            showToast("Successfully posted to feed!");
        } catch (err) {
            console.error(err);
            showToast("Failed to post. Please try again.", "error");
        } finally {
            setPosting(false);
        }
    };

    const handleLike = async (postId) => {
        try {
            const res = await api.patch(`/posts/${postId}/like`);
            setPosts(prev => prev.map(p =>
                p.id === postId ? { ...p, likes: res.data.likes } : p
            ));
        } catch (err) {
            console.error("Like error", err);
        }
    };

    const showToast = (message, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    return (
        <div className="max-w-4xl mx-auto space-y-8 md:space-y-12 pb-24 pt-2 md:pt-4 px-4">
            <header className="space-y-2">
                <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-center gap-3"
                >
                    <div className="p-2 bg-primary-500/10 rounded-lg">
                        <Sparkles className="text-primary-400" size={24} />
                    </div>
                    <h1 className="text-2xl md:text-4xl font-display font-bold text-white tracking-tight">Developer Feed</h1>
                </motion.div>
                <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.1 }}
                    className="text-gray-400 text-base md:text-lg font-inter"
                >
                    Connect, collaborate, and share your latest builds.
                </motion.p>
            </header>

            {/* Create Post Section */}
            <AnimatedCard className="relative group p-1 transition-all duration-700 bg-transparent border-none overflow-visible">
                {/* Premium Border Beam Animation */}
                <BorderBeam />

                <div className="relative z-10 bg-[#0a0a0f]/90 backdrop-blur-3xl p-4 md:p-8 rounded-[inherit] space-y-6 shadow-[0_0_50px_rgba(0,0,0,0.5)]">
                    <form onSubmit={handleCreatePost} className="space-y-6">
                        <div className="flex gap-3 md:gap-5">
                            <div className="relative shrink-0">
                                <div className="w-10 h-10 md:w-12 md:h-12 rounded-2xl bg-gradient-to-tr from-primary-500 to-accent-purple flex items-center justify-center text-white font-bold uppercase overflow-hidden shadow-lg shadow-primary-500/20">
                                    {user?.avatar ? (
                                        <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
                                    ) : (
                                        user?.name?.[0] || 'D'
                                    )}
                                </div>
                                <div className="absolute -bottom-1 -right-1 w-3 h-3 md:w-4 md:h-4 bg-green-500 border-2 border-dark-900 rounded-full" />
                            </div>
                            <div className="flex-1">
                                <textarea
                                    ref={textareaRef}
                                    value={newPost}
                                    onChange={(e) => setNewPost(e.target.value)}
                                    placeholder="What's your latest innovation?"
                                    className="w-full bg-transparent border-none focus:ring-0 text-white placeholder:text-gray-500/50 resize-none min-h-[40px] text-lg md:text-xl leading-relaxed py-2 custom-scrollbar transition-all font-inter"
                                    rows="1"
                                    style={{ boxShadow: 'none', border: 'none', outline: 'none' }}
                                />
                            </div>
                        </div>

                        <AnimatePresence>
                            {showCodeInput && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="overflow-hidden space-y-4"
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2 text-xs font-mono text-gray-500 bg-white/5 px-3 py-1.5 rounded-lg border border-white/5">
                                            <Code2 size={12} /> SNIPPET EDITOR
                                        </div>
                                        <select
                                            value={language}
                                            onChange={(e) => setLanguage(e.target.value)}
                                            className="bg-dark-800 border border-white/10 text-white text-[11px] rounded-lg px-3 py-1.5 focus:border-primary-500 outline-none uppercase font-mono tracking-wider cursor-pointer hover:bg-dark-700 transition-colors"
                                        >
                                            <option value="javascript">JavaScript</option>
                                            <option value="python">Python</option>
                                            <option value="css">CSS</option>
                                            <option value="html">HTML</option>
                                            <option value="cpp">C++</option>
                                        </select>
                                    </div>
                                    <div
                                        className="rounded-2xl overflow-hidden border border-primary-500/20 shadow-[0_0_40px_rgba(99,102,241,0.1)] ring-1 ring-primary-500/10 transition-all duration-300"
                                        style={{ height: `${editorHeight}px` }}
                                    >
                                        <Editor
                                            height="100%"
                                            language={language}
                                            value={codeSnippet}
                                            onChange={handleEditorChange}
                                            onMount={handleEditorDidMount}
                                            theme="vs-dark"
                                            options={{
                                                minimap: { enabled: false },
                                                fontSize: 14,
                                                fontFamily: 'JetBrains Mono, monospace',
                                                padding: { top: 16, bottom: 16 },
                                                smoothScrolling: true,
                                                scrollBeyondLastLine: false,
                                                lineNumbers: 'on',
                                                scrollBeyondLastColumn: 0,
                                                automaticLayout: true
                                            }}
                                        />
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <div className="flex justify-between items-center pt-4 border-t border-white/5">
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => setShowCodeInput(!showCodeInput)}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${showCodeInput
                                        ? 'bg-primary-500 text-white shadow-lg shadow-primary-500/25'
                                        : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white border border-white/5'
                                        }`}
                                >
                                    <Code2 size={18} />
                                    {showCodeInput ? 'Review Code' : 'Add Code'}
                                </button>
                            </div>
                            <div className="flex items-center gap-4">
                                <span className={`text-xs font-mono transition-colors ${newPost.length > 500 ? 'text-red-400' : 'text-gray-600'}`}>
                                    {newPost.length}/500
                                </span>
                                <Button
                                    type="submit"
                                    disabled={(!newPost.trim() && !codeSnippet.trim()) || posting}
                                    isLoading={posting}
                                    className="px-8 rounded-xl bg-gradient-to-r from-primary-500 to-accent-purple hover:scale-[1.02] active:scale-95 transition-all shadow-xl shadow-primary-500/20"
                                >
                                    <Send size={18} className="mr-2" /> Share Post
                                </Button>
                            </div>
                        </div>
                    </form>
                </div>
            </AnimatedCard>

            {/* Posts Feed */}
            <div className="space-y-8 min-h-[400px]">
                {loading ? (
                    <div className="space-y-8">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="h-64 rounded-3xl bg-white/5 animate-pulse border border-white/5" />
                        ))}
                    </div>
                ) : posts.length > 0 ? (
                    <AnimatePresence mode="popLayout">
                        {posts.map((post, i) => (
                            <motion.div
                                key={post.id || i}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                transition={{ delay: 0.05 * (i % 8) }}
                                layout
                            >
                                <AnimatedCard
                                    className="group hover:border-primary-500/30 hover:bg-dark-900/50 hover:shadow-2xl hover:shadow-primary-500/5 transition-all duration-200 p-4 md:p-8 border-white/5 relative overflow-hidden"
                                >
                                    {/* Glass Highlight */}
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-primary-500/5 blur-[80px] -mr-16 -mt-16 group-hover:bg-primary-500/10 transition-colors" />

                                    <div className="flex items-start justify-between mb-8">
                                        <div className="flex gap-4 items-center">
                                            <div className="w-12 h-12 rounded-2xl bg-dark-700 flex items-center justify-center border border-white/10 shrink-0 text-white font-bold uppercase shadow-inner group-hover:border-primary-500/30 transition-colors overflow-hidden">
                                                {post.author?.avatar ? (
                                                    <img src={post.author.avatar} alt={post.author.name} className="w-full h-full object-cover" />
                                                ) : (
                                                    (post.author?.name?.[0] || post.author?.username?.[0] || 'U')
                                                )}
                                            </div>
                                            <div>
                                                <h4 className="text-white font-bold text-lg leading-none mb-1.5 group-hover:text-primary-400 transition-colors">
                                                    {post.author?.name || post.author?.username || 'Unknown Developer'}
                                                </h4>
                                                <div className="flex items-center gap-2 text-xs text-gray-500 font-inter">
                                                    <span>@{post.author?.username || 'anon'}</span>
                                                    <span className="w-1 h-1 bg-gray-700 rounded-full" />
                                                    <span>{post.createdAt && !isNaN(new Date(post.createdAt).getTime()) ? formatDistanceToNow(new Date(post.createdAt), { addSuffix: true }) : 'just now'}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <button className="text-gray-500 hover:text-white p-2 rounded-xl hover:bg-white/5 transition-colors">
                                            <MoreHorizontal size={20} />
                                        </button>
                                    </div>

                                    <div className="space-y-6">
                                        {post.text && (
                                            <p className="text-gray-300 whitespace-pre-wrap leading-relaxed font-inter text-lg">
                                                {post.text}
                                            </p>
                                        )}

                                        {post.code && (
                                            <motion.div
                                                whileHover={{ scale: 1.005 }}
                                                className="transition-transform duration-300"
                                            >
                                                <CodeBlock code={post.code} language={post.language || 'javascript'} />
                                            </motion.div>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-8 text-sm text-gray-400 border-t border-white/5 mt-8 pt-6 transition-colors">
                                        <button
                                            onClick={() => handleLike(post.id)}
                                            className={`flex items-center gap-2 group/btn transition-all duration-300 ${post.likes?.includes(user?.id || user?.id)
                                                ? 'text-red-400'
                                                : 'text-gray-500 hover:text-red-400'
                                                }`}
                                        >
                                            <div className={`p-2 rounded-xl group-hover/btn:bg-red-400/10 transition-colors ${post.likes?.includes(user?.id || user?.id) ? 'bg-red-400/10' : ''
                                                }`}>
                                                <Heart
                                                    size={22}
                                                    className={`transition-all duration-300 ${post.likes?.includes(user?.id || user?.id)
                                                        ? 'fill-current scale-110'
                                                        : 'group-hover/btn:scale-125'
                                                        }`}
                                                />
                                            </div>
                                            <span className="font-mono font-medium">{post.likes?.length || 0}</span>
                                        </button>

                                        <button className="flex items-center gap-2 hover:text-primary-400 group/btn transition-all duration-300">
                                            <div className="p-2 rounded-xl group-hover/btn:bg-primary-400/10 transition-colors">
                                                <MessageSquare size={22} className="group-hover/btn:scale-125 transition-all duration-300" />
                                            </div>
                                            <span className="font-mono font-medium">{post.comments?.length || 0}</span>
                                        </button>

                                        <button className="flex items-center gap-2 hover:text-accent-purple group/btn transition-all duration-300 ml-auto">
                                            <div className="p-2 rounded-xl group-hover/btn:bg-accent-purple/10 transition-colors">
                                                <Share2 size={22} className="group-hover/btn:scale-125 transition-all duration-300" />
                                            </div>
                                        </button>
                                    </div>
                                </AnimatedCard>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                ) : (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex flex-col items-center justify-center py-32 text-gray-500 border border-dashed border-white/10 rounded-[2.5rem] bg-white/[0.02]"
                    >
                        <div className="p-6 bg-white/5 rounded-full mb-6">
                            <Send size={48} className="opacity-20" />
                        </div>
                        <p className="text-xl font-medium mb-2">The feed is empty</p>
                        <p className="text-gray-600">Be the first to spark a conversation!</p>
                    </motion.div>
                )}
            </div>

            <AnimatePresence>
                {toast && <Toast {...toast} onClose={() => setToast(null)} />}
            </AnimatePresence>
        </div>
    );
};
