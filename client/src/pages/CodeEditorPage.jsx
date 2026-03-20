import React, { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { io } from 'socket.io-client';
import api from '../services/api';
import { useCompletion } from '@ai-sdk/react';
import { AnimatedCard } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Play, Sparkles, Bug, Zap, MessageSquare, Users, Send } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

function useLatest(value) {
    const ref = useRef(value);
    ref.current = value;
    return ref;
}

const LANGUAGES = {
    javascript: { id: 63, name: 'JavaScript', extension: 'js' },
    python: { id: 71, name: 'Python', extension: 'py' },
    java: { id: 62, name: 'Java', extension: 'java' },
    c: { id: 50, name: 'C', extension: 'c' }
};

export const CodeEditorPage = () => {
    const [language, setLanguage] = useState('javascript');
    const [code, setCode] = useState('// Welcome to DevSphere Collaborative Editor\n// Start typing here...');
    const [output, setOutput] = useState('');
    const [isRunning, setIsRunning] = useState(false);

    const lastActionRef = useRef(null);

    // Vercel AI SDK Streaming Hook
    const { completion, complete, isLoading: isAiLoading } = useCompletion({
        api: 'http://localhost:5000/api/ai/code-help',
        onFinish: (prompt, completionResult) => {
            if (lastActionRef.current === 'optimize') {
                setCode(completionResult);
                if (socketRef.current) socketRef.current.emit('code-change', { roomId, code: completionResult });
            }
        },
        onError: (err) => {
            console.error("AI Streaming Error:", err);
        }
    });

    // Collaboration state
    const { user } = useAuth();
    const [messages, setMessages] = useState([]);
    const [chatInput, setChatInput] = useState('');
    const [activeTab, setActiveTab] = useState('chat'); // 'chat' or 'ai'
    const cursorsRef = useRef({});
    const decorationsRef = useRef([]);
    const roomId = 'global-workspace';
    const chatContainerRef = useRef(null);

    const editorRef = useRef(null);
    const socketRef = useRef(null);
    const latestUser = useLatest(user);

    useEffect(() => {
        socketRef.current = io('http://localhost:5000');

        socketRef.current.emit("join-room", { roomId, user: latestUser.current || { name: 'Anonymous' } });

        socketRef.current.on('code-update', (newCode) => {
            setCode(newCode);
        });

        socketRef.current.on('chat-update', (message) => {
            setMessages(prev => [...prev, message]);
        });

        socketRef.current.on('user-joined', ({ socketId, user: joinedUser }) => {
            setMessages(prev => [...prev, { system: true, text: `${joinedUser?.name || 'A user'} joined the workspace.` }]);
        });

        socketRef.current.on('user-left', (socketId) => {
            removeCursor(socketId);
        });

        socketRef.current.on('cursor-update', ({ socketId, line, column, user: cursorUser }) => {
            updateCursor(socketId, line, column, cursorUser);
        });

        return () => {
            if (socketRef.current) socketRef.current.disconnect();

            // Cleanup cursor styles
            const styleTag = document.getElementById('cursor-styles');
            if (styleTag) styleTag.remove();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [roomId, latestUser]);

    // Auto-scroll chat
    useEffect(() => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [messages, activeTab]);

    const renderCursors = () => {
        if (!editorRef.current) return;

        const decorations = Object.keys(cursorsRef.current).map(id => {
            const cursor = cursorsRef.current[id];
            return {
                range: {
                    startLineNumber: cursor.lineNumber,
                    startColumn: cursor.column,
                    endLineNumber: cursor.lineNumber,
                    endColumn: cursor.column
                },
                options: {
                    className: `remote-cursor-${id}`,
                    hoverMessage: { value: `**${cursor.user?.name || 'Anonymous'}**` }
                }
            };
        });

        decorationsRef.current = editorRef.current.deltaDecorations(decorationsRef.current, decorations);

        let styleTag = document.getElementById('cursor-styles');
        if (!styleTag) {
            styleTag = document.createElement('style');
            styleTag.id = 'cursor-styles';
            document.head.appendChild(styleTag);
        }

        let css = '';
        Object.keys(cursorsRef.current).forEach(id => {
            const colors = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'];
            const color = colors[id.charCodeAt(0) % colors.length];
            // Render a distinct glowing cursor pipe
            css += `.remote-cursor-${id} { border-left: 2px solid ${color}; position: absolute; z-index: 9; box-shadow: 0 0 5px ${color}; }`;
        });
        styleTag.innerHTML = css;
    };

    const updateCursor = (socketId, lineNumber, column, cursorUser) => {
        if (!editorRef.current) return;
        cursorsRef.current[socketId] = { lineNumber, column, user: cursorUser };
        renderCursors();
    };

    const removeCursor = (socketId) => {
        if (cursorsRef.current[socketId]) {
            delete cursorsRef.current[socketId];
            if (editorRef.current) renderCursors();
        }
    };

    const handleEditorChange = (value) => {
        setCode(value);
        if (socketRef.current) socketRef.current.emit('code-change', { roomId, code: value });
    };

    const handleEditorDidMount = (editor) => {
        editorRef.current = editor;

        editor.onDidChangeCursorPosition((e) => {
            if (socketRef.current) {
                socketRef.current.emit('cursor-change', {
                    roomId,
                    cursorData: {
                        line: e.position.lineNumber,
                        column: e.position.column,
                        user: latestUser.current || { name: 'Anonymous' }
                    }
                });
            }
        });
    };

    const handleSendMessage = (e) => {
        e.preventDefault();
        if (!chatInput.trim()) return;

        const message = {
            id: Date.now().toString(),
            text: chatInput,
            user: latestUser.current || { name: 'Anonymous' },
            timestamp: new Date().toISOString()
        };

        socketRef.current.emit('chat-message', { roomId, message });
        setMessages(prev => [...prev, message]);
        setChatInput('');
    };

    const executeCode = async () => {
        setIsRunning(true);
        try {
            const res = await api.post('/code/run', {
                code,
                language_id: LANGUAGES[language].id
            });

            // Judge0 returns token, we normally might have to poll.
            // If the backend handles polling, it returns the output directly.
            if (res.data && res.data.stdout) {
                setOutput(res.data.stdout);
            } else if (res.data && res.data.stderr) {
                setOutput(res.data.stderr);
            } else if (res.data && res.data.compile_output) {
                setOutput(res.data.compile_output);
            } else {
                setOutput(JSON.stringify(res.data, null, 2));
            }
        } catch (err) {
            setOutput(`Error executing code:\n${err.message}`);
        } finally {
            setIsRunning(false);
        }
    };

    const askAi = async (action) => {
        lastActionRef.current = action;
        const selectedCode = editorRef.current?.getModel().getValueInRange(editorRef.current?.getSelection());
        const codeToSend = selectedCode || code;

        // Trigger the Vercel AI SDK stream
        complete(codeToSend, {
            body: { action }
        });
    };

    const handleLanguageChange = (e) => {
        const newLang = e.target.value;
        setLanguage(newLang);

        let prefix = "//";
        if (newLang === 'python') prefix = "#";

        const boilerplate = `${prefix} Welcome to DevSphere Collaborative Editor\n${prefix} Start typing here...`;

        if (code.includes('Welcome to DevSphere Collaborative Editor')) {
            setCode(boilerplate);
            if (socketRef.current) socketRef.current.emit('code-change', { roomId, code: boilerplate });
        }
    };

    return (
        <div className="h-[calc(100vh-100px)] flex flex-col lg:flex-row gap-6">
            {/* Editor Main Area */}
            <div className="flex-1 flex flex-col gap-4 h-full">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-display font-bold text-white">Collaborative Workspace</h1>
                        <p className="text-sm text-gray-400">Live Editor connected via Socket.io</p>
                    </div>
                    <div className="flex gap-4 items-center">
                        <select
                            value={language}
                            onChange={handleLanguageChange}
                            className="bg-dark-800 border border-white/10 text-white text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-primary-500 transition-colors"
                        >
                            {Object.entries(LANGUAGES).map(([key, lang]) => (
                                <option key={key} value={key} className="bg-dark-900 text-white">{lang.name}</option>
                            ))}
                        </select>
                        <Button onClick={executeCode} isLoading={isRunning} className="gap-2 bg-green-500 hover:bg-green-600 text-white shadow-none">
                            <Play size={16} /> Run Code
                        </Button>
                    </div>
                </div>

                <AnimatedCard className="flex-1 p-0 overflow-hidden border border-white/10 rounded-2xl relative">
                    <div className="absolute top-0 left-0 w-full h-10 bg-dark-900 border-b border-white/10 flex items-center px-4 gap-2 z-10">
                        <div className="flex gap-1.5">
                            <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
                            <div className="w-3 h-3 rounded-full bg-yellow-500/80"></div>
                            <div className="w-3 h-3 rounded-full bg-green-500/80"></div>
                        </div>
                        <div className="text-xs text-gray-500 ml-4 font-mono">main.{LANGUAGES[language].extension}</div>
                    </div>
                    <div className="pt-10 h-full">
                        <Editor
                            height="100%"
                            language={language}
                            defaultLanguage="javascript"
                            theme="vs-dark"
                            value={code}
                            onChange={handleEditorChange}
                            onMount={handleEditorDidMount}
                            options={{
                                minimap: { enabled: false },
                                fontSize: 14,
                                fontFamily: 'JetBrains Mono, monospace',
                                padding: { top: 16 },
                                smoothScrolling: true,
                                cursorBlinking: 'smooth',
                                cursorSmoothCaretAnimation: true,
                                formatOnPaste: true,
                            }}
                            loading={<div className="h-full flex items-center justify-center text-gray-500">Loading Editor…</div>}
                        />
                    </div>
                </AnimatedCard>

                {/* Output Console */}
                <AnimatedCard className="h-48 bg-black text-green-400 font-mono text-sm overflow-auto p-4 flex flex-col custom-scrollbar border border-white/5">
                    <div className="text-gray-500 text-xs mb-2 uppercase tracking-widest flex items-center gap-2">
                        <TerminalSquare size={12} /> Execution Output
                    </div>
                    <pre className="whitespace-pre-wrap">{output || 'No output yet.'}</pre>
                </AnimatedCard>
            </div>

            {/* Sidebar */}
            <AnimatedCard className="w-full lg:w-80 flex flex-col shrink-0 h-[600px] lg:h-full border border-primary-500/20 shadow-[inset_0_0_20px_rgba(99,102,241,0.05)] bg-dark-800/80 backdrop-blur-2xl p-4">
                {/* Tabs */}
                <div className="flex border-b border-white/10 mb-4 bg-dark-800/80">
                    <button
                        onClick={() => setActiveTab('chat')}
                        className={`flex-1 py-3 text-sm font-medium rounded-t-lg transition-colors flex items-center justify-center gap-2 ${activeTab === 'chat' ? 'bg-primary-500/10 text-primary-400 border-b-2 border-primary-500' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                    >
                        <MessageSquare size={16} /> Workspace Chat
                    </button>
                    <button
                        onClick={() => setActiveTab('ai')}
                        className={`flex-1 py-3 text-sm font-medium rounded-t-lg transition-colors flex items-center justify-center gap-2 ${activeTab === 'ai' ? 'bg-primary-500/10 text-primary-400 border-b-2 border-primary-500' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                    >
                        <Sparkles size={16} /> AI Co-pilot
                    </button>
                </div>

                {activeTab === 'chat' ? (
                    <div className="flex-1 flex flex-col min-h-0 relative">
                        <div ref={chatContainerRef} className="flex-1 overflow-y-auto custom-scrollbar space-y-4 pb-16">
                            {messages.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-gray-500 text-center px-4 pt-10">
                                    <Users size={32} className="mb-3 opacity-30" />
                                    <p className="text-sm">Welcome to the shared workspace. Say hi to your team!</p>
                                </div>
                            ) : (
                                messages.map((m, i) => m.system ? (
                                    <div key={i} className="text-center text-[11px] text-gray-500 my-4 uppercase tracking-wider">{m.text}</div>
                                ) : (
                                    <div key={m.id || i} className={`flex flex-col ${m.user?.name === user?.name ? 'items-end' : 'items-start'}`}>
                                        <div className="text-[10px] text-gray-500 mb-1 px-1">{m.user?.name || 'Anonymous'}</div>
                                        <div className={`px-4 py-2 text-sm shadow-lg ${m.user?.name === user?.name ? 'bg-gradient-to-br from-primary-500 to-accent-purple text-white rounded-2xl rounded-tr-sm' : 'bg-dark-700/80 border border-white/5 text-gray-200 rounded-2xl rounded-tl-sm'}`}>
                                            {m.text}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                        <div className="absolute bottom-0 left-0 w-full pt-2 pb-1 bg-dark-800">
                            <form onSubmit={handleSendMessage} className="relative">
                                <input
                                    type="text"
                                    value={chatInput}
                                    onChange={e => setChatInput(e.target.value)}
                                    placeholder="Type a message…"
                                    className="w-full bg-dark-900/80 border border-white/10 rounded-full pl-5 pr-12 py-3 text-sm focus:outline-none focus:border-primary-500 text-white placeholder-gray-500 transition-colors"
                                />
                                <button type="submit" className="absolute right-1 top-1/2 -translate-y-1/2 text-white bg-primary-500 p-2 hover:bg-primary-400 rounded-full transition-colors shadow-neon-blue">
                                    <Send size={14} className="ml-0.5" />
                                </button>
                            </form>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col overflow-y-auto min-h-0 pt-2 custom-scrollbar">
                        <div className="grid grid-cols-1 gap-3 mb-6 shrink-0">
                            <Button variant="secondary" size="sm" onClick={() => askAi('explain')} className="justify-start gap-3 w-full border-white/5 hover:border-primary-500/50 hover:text-primary-400 bg-dark-900/50">
                                <Sparkles size={16} /> Explain Code
                            </Button>
                            <Button variant="secondary" size="sm" onClick={() => askAi('fix')} className="justify-start gap-3 w-full border-white/5 hover:border-red-500/50 hover:text-red-400 bg-dark-900/50">
                                <Bug size={16} /> Find Bugs
                            </Button>
                            <Button variant="secondary" size="sm" onClick={() => askAi('optimize')} className="justify-start gap-3 w-full border-white/5 hover:border-yellow-500/50 hover:text-yellow-400 bg-dark-900/50">
                                <Zap size={16} /> Optimize
                            </Button>
                        </div>

                        <div className="flex-1 bg-dark-900/50 rounded-xl border border-white/5 p-4 overflow-y-auto custom-scrollbar">
                            {isAiLoading ? (
                                <div className="flex flex-col items-center justify-center h-full text-primary-400 space-y-4 pt-10">
                                    <Sparkles className="animate-spin" />
                                    <p className="text-sm font-medium animate-pulse">Analyzing code…</p>
                                </div>
                            ) : completion ? (
                                <div className="prose prose-invert prose-sm text-gray-300">
                                    <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed bg-transparent p-0 m-0">{completion}</pre>
                                </div>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-gray-500 text-center px-4 pt-10">
                                    <Sparkles size={32} className="mb-3 opacity-30" />
                                    <p className="text-sm">Highlight code and click an action above to get AI assistance.</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </AnimatedCard>
        </div>
    );
};

const TerminalSquare = (props) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <polyline points="4 17 10 11 4 5" />
        <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
);
