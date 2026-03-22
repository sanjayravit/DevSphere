import React, { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { io } from 'socket.io-client';
import api from '../services/api';
import { AnimatedCard } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Play, Sparkles, Bug, Zap, MessageSquare, Users, Send, Save, FileCode, GitCommit, GitBranch, Code2, Trash2, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useParams } from 'react-router-dom';

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

const DEFAULT_TEMPLATES = {
    javascript: `// Welcome to DevSphere Collaborative Editor\n// Start building something amazing!\n\nconsole.log("Hello from DevSphere!");\n`,
    python: `# Welcome to DevSphere Collaborative Editor\n# Start building something amazing!\n\nprint("Hello from DevSphere!")\n`,
    java: `// Welcome to DevSphere Collaborative Editor\n// Start building something amazing!\n\npublic class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello from DevSphere!");\n    }\n}\n`,
    c: `// Welcome to DevSphere Collaborative Editor\n// Start building something amazing!\n\n#include <stdio.h>\n\nint main() {\n    printf("Hello from DevSphere!\\n");\n    return 0;\n}\n`
};

const TerminalSquare = (props) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <polyline points="4 17 10 11 4 5" />
        <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
);

export const CodeEditorPage = () => {
    const { projectId } = useParams();
    const [project, setProject] = useState(null);
    const [files, setFiles] = useState([]);
    const [activeFileIndex, setActiveFileIndex] = useState(0);
    const [isSaving, setIsSaving] = useState(false);

    const [language, setLanguage] = useState('javascript');
    const [code, setCode] = useState(DEFAULT_TEMPLATES.javascript);
    const [output, setOutput] = useState('');
    const [isRunning, setIsRunning] = useState(false);

    const [aiChatInput, setAiChatInput] = useState('');
    const [aiHistory, setAiHistory] = useState([]);
    const [isAiLoading, setIsAiLoading] = useState(false);

    // Git State
    const [gitHistory, setGitHistory] = useState([]);
    const [commitMessage, setCommitMessage] = useState('');
    const [isCommitting, setIsCommitting] = useState(false);

    // Collaboration state
    const { user } = useAuth();
    const [messages, setMessages] = useState([]);
    const [chatInput, setChatInput] = useState('');
    const [activeTab, setActiveTab] = useState('chat'); // 'chat', 'ai', 'git'
    const [targetLanguage, setTargetLanguage] = useState('python');
    const cursorsRef = useRef({});
    const decorationsRef = useRef([]);
    const chatContainerRef = useRef(null);
    const outputRef = useRef(null);

    const editorRef = useRef(null);
    const monacoRef = useRef(null);
    const socketRef = useRef(null);
    const latestUser = useLatest(user);

    // Initial project schema fetching
    useEffect(() => {
        if (!projectId) return;
        api.get(`/projects/${projectId}`).then(res => {
            setProject(res.data);
            if (res.data.chatHistory) {
                setAiHistory(res.data.chatHistory);
            }
            if (res.data.files && res.data.files.length > 0) {
                setFiles(res.data.files);
                setCode(res.data.files[0].content);
                setLanguage(res.data.files[0].language);
            }
            fetchGitHistory();
        }).catch(err => console.error("Initialize Error:", err));
    }, [projectId]);

    const fetchGitHistory = async () => {
        try {
            const res = await api.get(`/git/${projectId}/history`);
            setGitHistory(res.data || []);
        } catch (err) {
            console.error("Failed to fetch git history");
        }
    };

    useEffect(() => {
        if (!projectId) return;

        socketRef.current = io('http://localhost:5050');

        socketRef.current.emit("join-room", { roomId: projectId, user: latestUser.current || { name: 'Anonymous' } });

        socketRef.current.on('code-update', (incomingPayload) => {
            // Unpack generic updates versus explicitly indexed file broadcasts
            const isLegacy = typeof incomingPayload === 'string';
            const newCode = isLegacy ? incomingPayload : incomingPayload.code;
            const fileIndex = isLegacy ? activeFileIndex : incomingPayload.fileIndex;

            // Only update local view if we are on the exact same active tab as the incoming file signal
            if (activeFileIndex === fileIndex || isLegacy) {
                setCode(newCode);
            }

            setFiles(prev => {
                const updated = [...prev];
                if (updated[fileIndex]) updated[fileIndex].content = newCode;
                return updated;
            });
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

        socketRef.current.on('ai-update', (aiMessage) => {
            // Check if it's already in history to avoid double local append for the sender
            setAiHistory(prev => [...prev, aiMessage]);
        });

        return () => {
            if (socketRef.current) socketRef.current.disconnect();

            // Cleanup cursor styles
            const styleTag = document.getElementById('cursor-styles');
            if (styleTag) styleTag.remove();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectId, latestUser]);

    // Auto-scroll output terminal
    useEffect(() => {
        if (outputRef.current) {
            outputRef.current.scrollTop = outputRef.current.scrollHeight;
        }
    }, [output]);

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
            const cursorUser = cursorsRef.current[id].user;
            const colors = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'];
            const color = colors[id.charCodeAt(0) % colors.length];
            const name = cursorUser?.name?.split(' ')[0] || 'User';

            css += `
                .remote-cursor-${id} { 
                    border-left: 2px solid ${color}; 
                    position: absolute; 
                    z-index: 9; 
                    box-shadow: 0 0 5px ${color}; 
                }
                .remote-cursor-${id}::after {
                    content: '${name}';
                    position: absolute;
                    top: -22px;
                    left: 0;
                    background: ${color};
                    color: white;
                    font-size: 10px;
                    font-weight: bold;
                    padding: 2px 6px;
                    border-radius: 4px;
                    white-space: nowrap;
                    pointer-events: none;
                    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2);
                }
            `;
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

    // Live AI Linter (Debounced)
    useEffect(() => {
        if (!code || !projectId || !editorRef.current || !monacoRef.current) return;

        const lintTimer = setTimeout(async () => {
            try {
                const res = await api.post('/ai/copilot', {
                    action: 'lint',
                    code,
                    projectId
                });

                let rawRes = res.data.result.trim();
                rawRes = rawRes.replace(/^\`\`\`(json)?/i, '').replace(/\`\`\`$/i, '').trim();

                let issues = [];
                try {
                    issues = JSON.parse(rawRes);
                } catch (e) { } // Ignore if AI spits out conversational garbage natively

                if (Array.isArray(issues) && monacoRef.current) {
                    const markers = issues.map(issue => ({
                        severity: monacoRef.current.MarkerSeverity.Warning,
                        message: `🤖 AI Debugger: ${issue.message}`,
                        startLineNumber: issue.line,
                        startColumn: 1,
                        endLineNumber: issue.line,
                        endColumn: 100,
                    }));
                    monacoRef.current.editor.setModelMarkers(editorRef.current.getModel(), 'ai-linter', markers);
                }
            } catch (err) {
                console.error("Live Linting Error", err);
            }
        }, 2000); // 2-second debounce for snappy diagnostic mapping

        return () => clearTimeout(lintTimer);
    }, [code, projectId]);

    const handleEditorChange = (value) => {
        setCode(value);
        if (socketRef.current) socketRef.current.emit('code-change', { roomId: projectId, code: { code: value, fileIndex: activeFileIndex } });

        setFiles(prev => {
            const next = [...prev];
            if (next[activeFileIndex]) next[activeFileIndex].content = value;
            return next;
        });
    };

    const handleSave = async () => {
        if (!projectId) return;
        setIsSaving(true);
        try {
            await api.put(`/projects/${projectId}/files`, { files });
        } catch (err) {
            console.error("Save Error:", err);
        } finally {
            setIsSaving(false);
        }
    };

    const handleTabSwitch = (index) => {
        setActiveFileIndex(index);
        setCode(files[index].content);
        setLanguage(files[index].language);
    };

    const handleEditorDidMount = (editor, monaco) => {
        editorRef.current = editor;
        monacoRef.current = monaco;

        // Register Inline Completions Provider for Ghost Text
        monaco.languages.registerInlineCompletionsProvider(language, {
            provideInlineCompletions: async (model, position) => {
                // Get code up to current cursor position to give context to AI
                const textUntilPosition = model.getValueInRange({
                    startLineNumber: 1,
                    startColumn: 1,
                    endLineNumber: position.lineNumber,
                    endColumn: position.column
                });

                // Debounce simple return to prevent spamming API on every keystroke
                // In production, you'd use a real debounce ref, but for this demo, 
                // we'll fetch explicitly when the provider is invoked by Monaco (which adds a slight delay natively).

                try {
                    const res = await api.post('/ai/copilot', {
                        action: 'continue',
                        code: textUntilPosition,
                        projectId
                    });

                    if (res.data && res.data.result) {
                        return {
                            items: [{
                                insertText: res.data.result.replace(/^\`\`\`.*\n/, '').replace(/\n\`\`\`$/, ''), // Strip markdown if it leaked
                                range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column)
                            }]
                        };
                    }
                } catch (err) {
                    console.error("Ghost Complete Error:", err);
                }

                return { items: [] };
            },
            freeInlineCompletions: () => { }
        });

        editor.onDidChangeCursorPosition((e) => {
            if (socketRef.current) {
                socketRef.current.emit('cursor-change', {
                    roomId: projectId,
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

        socketRef.current.emit('chat-message', { roomId: projectId, message });
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

    const handleAiChat = async (e) => {
        e.preventDefault();
        if (!aiChatInput.trim()) return;

        const userMsg = aiChatInput;
        setAiChatInput('');
        const userAiMessage = { role: 'user', content: userMsg };
        setAiHistory(prev => [...prev, userAiMessage]);
        if (socketRef.current) {
            socketRef.current.emit('ai-response', { roomId: projectId, message: userAiMessage });
        }
        setIsAiLoading(true);

        const isProjectQuery = userMsg.toLowerCase().startsWith('/project ');
        const actionPayload = isProjectQuery ? 'project-query' : 'chat';
        const cleanedMsg = isProjectQuery ? userMsg.slice(9) : userMsg;

        try {
            const selectedCode = editorRef.current?.getModel().getValueInRange(editorRef.current?.getSelection());
            const codeToSend = selectedCode || code;

            const res = await api.post('/ai/copilot', {
                action: actionPayload,
                message: cleanedMsg,
                code: codeToSend,
                projectId
            });

            const modelMessage = { role: 'model', content: res.data.result };
            setAiHistory(prev => [...prev, modelMessage]);
            if (socketRef.current) {
                socketRef.current.emit('ai-response', { roomId: projectId, message: modelMessage });
            }
        } catch (err) {
            const errorMessage = { role: 'model', content: `Error: ${err.message}` };
            setAiHistory(prev => [...prev, errorMessage]);
            if (socketRef.current) {
                socketRef.current.emit('ai-response', { roomId: projectId, message: errorMessage });
            }
        } finally {
            setIsAiLoading(false);
        }
    };

    const handleAiAction = async (action) => {
        setIsAiLoading(true);
        const actionStartMsg = { role: 'user', content: `Run AI Action: ${action}` };
        setAiHistory(prev => [...prev, actionStartMsg]);
        if (socketRef.current) {
            socketRef.current.emit('ai-response', { roomId: projectId, message: actionStartMsg });
        }

        try {
            const selectedCode = editorRef.current?.getModel().getValueInRange(editorRef.current?.getSelection());
            const codeToSend = selectedCode || code;

            const res = await api.post('/ai/copilot', {
                action: action,
                code: codeToSend,
                projectId,
                targetLanguage: action === 'convert' ? targetLanguage : undefined
            });

            let modelResponse = "";
            if (action === "optimize" || action === "optimise" || action === "refactor" || action === "convert") {
                if (res.data.result) {
                    setCode(res.data.result);
                    if (socketRef.current) {
                        socketRef.current.emit('code-change', { roomId: projectId, code: { code: res.data.result, fileIndex: activeFileIndex } });
                    }
                    modelResponse = `Code ${action}ed and applied to the editor successfully.`;
                } else {
                    modelResponse = "AI returned an empty result for this action.";
                }
            } else {
                modelResponse = res.data.result;
            }

            const actionResultMsg = { role: 'model', content: modelResponse };
            setAiHistory(prev => [...prev, actionResultMsg]);
            if (socketRef.current) {
                socketRef.current.emit('ai-response', { roomId: projectId, message: actionResultMsg });
            }
        } catch (err) {
            console.error("AI Error:", err);
            const errorMsg = { role: 'model', content: `Error: ${err.response?.data?.error || err.message}` };
            setAiHistory(prev => [...prev, errorMsg]);
            if (socketRef.current) {
                socketRef.current.emit('ai-response', { roomId: projectId, message: errorMsg });
            }
        } finally {
            setIsAiLoading(false);
        }
    };

    const handleGitCommit = async (e) => {
        e.preventDefault();
        setIsCommitting(true);
        try {
            // Auto-save before commit to ensure DB matches editor State
            await handleSave();
            const res = await api.post(`/git/${projectId}/commit`, { message: commitMessage });

            if (res.data.success) {
                setCommitMessage('');
                fetchGitHistory();
                if (res.data.aiReview) {
                    // System echo the AI review into workspace chat for team visibility
                    setMessages(prev => [...prev, { system: true, text: `AI Code Review Complete for commit: ${res.data.commitId || 'latest'}` }]);
                }
            }
        } catch (err) {
            console.error("Commit Error", err);
        } finally {
            setIsCommitting(false);
        }
    };

    const handleLanguageChange = (e) => {
        const newLang = e.target.value;
        setLanguage(newLang);

        // Check if code matches any default template or the old welcome text
        const isDefaultCode = Object.values(DEFAULT_TEMPLATES).some(t => code.trim() === t.trim())
            || code.includes('Welcome to DevSphere')
            || code.includes('// Loading workspace');

        if (isDefaultCode) {
            const newTemplate = DEFAULT_TEMPLATES[newLang] || DEFAULT_TEMPLATES.javascript;
            setCode(newTemplate);
            if (socketRef.current) {
                socketRef.current.emit('code-change', { roomId: projectId, code: { code: newTemplate, fileIndex: activeFileIndex } });
            }
        }
    };

    return (
        <div className="h-[calc(100vh-100px)] flex flex-col lg:flex-row gap-6">
            {/* Editor Main Area */}
            <div className="flex-1 flex flex-col gap-4 h-full">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-display font-bold text-white uppercase tracking-wider">{project?.name || 'Project File'}</h1>
                        <p className="text-sm text-gray-400">Collaborative Workspace • {files.length} File(s)</p>
                    </div>
                    <div className="flex gap-4 items-center">
                        <Button variant="secondary" onClick={handleSave} isLoading={isSaving} className="gap-2 border-white/10 hover:border-primary-500/50 bg-dark-800">
                            <Save size={16} className={isSaving ? 'animate-pulse' : ''} /> Save to Cloud
                        </Button>
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
                    <div className="flex w-full overflow-x-auto custom-scrollbar bg-dark-950 border-b border-white/10">
                        {files.map((file, index) => (
                            <button
                                key={index}
                                onClick={() => handleTabSwitch(index)}
                                className={`flex items-center gap-2 px-6 py-3 font-mono text-xs border-r border-white/5 transition-colors ${activeFileIndex === index ? 'bg-dark-800 text-primary-400 border-t-2 border-t-primary-500 shadow-xl z-20' : 'bg-dark-900 text-gray-500 hover:bg-dark-800/80 hover:text-gray-300'
                                    }`}
                            >
                                <FileCode size={14} /> {file.name}
                            </button>
                        ))}
                    </div>
                    <div className="h-[calc(100%-48px)]">
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
                                inlineSuggest: { enabled: true }
                            }}
                            loading={<div className="h-full flex items-center justify-center text-gray-500">Loading Editor…</div>}
                        />
                    </div>
                </AnimatedCard>

                {/* Output Console — Premium Terminal */}
                <AnimatedCard className="h-56 bg-[#0a0a0f] text-green-400 font-mono text-sm flex flex-col border border-white/5 rounded-xl overflow-hidden">
                    {/* Terminal Header */}
                    <div className="flex items-center justify-between px-4 py-2.5 bg-dark-800/80 border-b border-white/5 shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="flex gap-1.5">
                                <div className="w-3 h-3 rounded-full bg-red-500/80" />
                                <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                                <div className="w-3 h-3 rounded-full bg-green-500/80" />
                            </div>
                            <div className="text-gray-500 text-xs uppercase tracking-widest flex items-center gap-2">
                                <TerminalSquare size={12} className="text-gray-500" />
                                {isRunning ? (
                                    <span className="flex items-center gap-1.5 text-primary-400">
                                        <Loader2 size={12} className="animate-spin" /> Running…
                                    </span>
                                ) : (
                                    <span>Terminal</span>
                                )}
                            </div>
                        </div>
                        {output && (
                            <button
                                onClick={() => setOutput('')}
                                className="flex items-center gap-1.5 text-gray-500 hover:text-red-400 text-xs transition-colors px-2 py-1 rounded-md hover:bg-white/5"
                                title="Clear output"
                            >
                                <Trash2 size={12} /> Clear
                            </button>
                        )}
                    </div>
                    {/* Terminal Body */}
                    <div ref={outputRef} className="flex-1 overflow-y-auto custom-scrollbar p-4">
                        {isRunning && !output ? (
                            <div className="flex items-center gap-2 text-primary-400 text-xs animate-pulse">
                                <Loader2 size={14} className="animate-spin" />
                                <span>Compiling and executing your code…</span>
                            </div>
                        ) : output ? (
                            <pre className="whitespace-pre-wrap text-green-400 leading-relaxed">{output}</pre>
                        ) : (
                            <div className="text-gray-600 text-xs italic">Click "Run Code" to see execution output here.</div>
                        )}
                    </div>
                </AnimatedCard>
            </div>

            {/* Sidebar */}
            <AnimatedCard className="w-full lg:w-80 flex flex-col shrink-0 h-[600px] lg:h-full border border-primary-500/20 shadow-[inset_0_0_20px_rgba(99,102,241,0.05)] bg-dark-800/80 backdrop-blur-2xl p-4">
                {/* Tabs */}
                <div className="flex border-b border-white/10 mb-4 bg-dark-800/80">
                    <button
                        onClick={() => setActiveTab('chat')}
                        className={`flex-1 py-3 text-xs font-medium transition-colors flex flex-col items-center justify-center gap-1.5 ${activeTab === 'chat' ? 'bg-primary-500/10 text-primary-400 border-b-2 border-primary-500' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                    >
                        <MessageSquare size={16} /> Chat
                    </button>
                    <button
                        onClick={() => setActiveTab('ai')}
                        className={`flex-1 py-3 text-xs font-medium transition-colors flex flex-col items-center justify-center gap-1.5 ${activeTab === 'ai' ? 'bg-primary-500/10 text-primary-400 border-b-2 border-primary-500' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                    >
                        <Sparkles size={16} /> Copilot
                    </button>
                    <button
                        onClick={() => setActiveTab('git')}
                        className={`flex-1 py-3 text-xs font-medium transition-colors flex flex-col items-center justify-center gap-1.5 ${activeTab === 'git' ? 'bg-primary-500/10 text-primary-400 border-b-2 border-primary-500' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                    >
                        <GitBranch size={16} /> Source
                    </button>
                </div>

                {activeTab === 'chat' && (
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
                )}

                {activeTab === 'ai' && (
                    <div className="flex-1 flex flex-col min-h-0 relative">
                        <div className="grid grid-cols-2 gap-2 shrink-0 p-2 pb-0">
                            <Button variant="secondary" size="sm" onClick={() => handleAiAction('explain')} className="border-white/5 hover:border-primary-500/50 hover:text-primary-400 bg-dark-900/50 px-0">
                                <Sparkles size={14} /> Explain
                            </Button>
                            <Button variant="secondary" size="sm" onClick={() => handleAiAction('bugs')} className="border-white/5 hover:border-red-500/50 hover:text-red-400 bg-dark-900/50 px-0">
                                <Bug size={14} /> Find Bugs
                            </Button>
                            <Button variant="secondary" size="sm" onClick={() => handleAiAction('optimize')} className="border-white/5 hover:border-yellow-500/50 hover:text-yellow-400 bg-dark-900/50 px-0">
                                <Zap size={14} /> Optimize
                            </Button>
                            <Button variant="secondary" size="sm" onClick={() => handleAiAction('refactor')} className="border-white/5 hover:border-blue-500/50 hover:text-blue-400 bg-dark-900/50 px-0">
                                <GitCommit size={14} /> Refactor
                            </Button>
                            <div className="col-span-2 flex gap-2">
                                <Button variant="secondary" size="sm" onClick={() => handleAiAction('convert')} className="flex-1 border-white/5 hover:border-green-500/50 hover:text-green-400 bg-dark-900/50 px-0">
                                    <Code2 size={14} /> Convert to:
                                </Button>
                                <select
                                    className="bg-dark-900/80 border border-white/10 text-xs text-gray-400 rounded-lg px-2 focus:outline-none focus:border-primary-500"
                                    value={targetLanguage}
                                    onChange={(e) => setTargetLanguage(e.target.value)}
                                >
                                    <option value="python">Python</option>
                                    <option value="javascript">JavaScript</option>
                                    <option value="java">Java</option>
                                    <option value="cpp">C++</option>
                                </select>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-4 pb-16">
                            {aiHistory.length === 0 && !isAiLoading ? (
                                <div className="h-full flex flex-col items-center justify-center text-gray-500 text-center px-4 pt-4">
                                    <Sparkles size={32} className="mb-3 opacity-30" />
                                    <p className="text-sm">Highlight code and ask a question below or trigger a quick action to begin.</p>
                                </div>
                            ) : (
                                aiHistory.map((msg, i) => (
                                    <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                        <div className="text-[10px] text-gray-500 mb-1 px-1">{msg.role === 'user' ? 'You' : 'Copilot'}</div>
                                        <div className={`px-4 py-3 text-sm shadow-lg max-w-[95%] overflow-x-auto border ${msg.role === 'user' ? 'bg-primary-500/10 border-primary-500/20 text-white rounded-2xl rounded-tr-sm' : 'bg-dark-900/80 border-white/5 text-gray-300 rounded-2xl rounded-tl-sm prose prose-invert prose-sm'}`}>
                                            <pre className="whitespace-pre-wrap font-sans bg-transparent p-0 m-0">{msg.content}</pre>
                                        </div>
                                    </div>
                                ))
                            )}
                            {isAiLoading && (
                                <div className="flex flex-col items-center justify-center py-4 text-primary-400 space-y-2">
                                    <Sparkles className="animate-spin" size={20} />
                                    <p className="text-xs font-medium animate-pulse">Thinking…</p>
                                </div>
                            )}
                        </div>

                        <div className="absolute bottom-0 left-0 w-full pt-2 pb-1 bg-dark-800 px-2 rounded-b-2xl">
                            <form onSubmit={handleAiChat} className="relative">
                                <input
                                    type="text"
                                    value={aiChatInput}
                                    onChange={e => setAiChatInput(e.target.value)}
                                    placeholder="Ask AI Copilot..."
                                    className="w-full bg-dark-900/80 border border-white/10 rounded-full pl-5 pr-12 py-3 text-sm focus:outline-none focus:border-primary-500 text-white placeholder-gray-500 transition-colors shadow-[0_-10px_20px_rgba(0,0,0,0.3)]"
                                    disabled={isAiLoading}
                                />
                                <button type="submit" disabled={isAiLoading} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-white bg-primary-500 p-2 hover:bg-primary-400 rounded-full transition-colors disabled:opacity-50">
                                    <Send size={14} className="ml-0.5" />
                                </button>
                            </form>
                        </div>
                    </div>
                )}

                {activeTab === 'git' && (
                    <div className="flex-1 flex flex-col min-h-0 relative">
                        <div className="shrink-0 p-3 bg-dark-900/50 border border-white/5 rounded-xl mb-4">
                            <form onSubmit={handleGitCommit} className="space-y-3">
                                <input
                                    type="text"
                                    value={commitMessage}
                                    onChange={e => setCommitMessage(e.target.value)}
                                    placeholder="Commit message (e.g. Add auth feature)"
                                    className="w-full bg-dark-950 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary-500 text-white placeholder-gray-500"
                                />
                                <Button type="submit" isLoading={isCommitting} className="w-full justify-center gap-2 py-2 text-sm">
                                    <GitCommit size={14} /> Commit & AI Review
                                </Button>
                            </form>
                        </div>
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3 pl-1">Commit History</div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-1 pb-4">
                            {gitHistory.length === 0 ? (
                                <div className="text-center text-sm text-gray-500 py-6 italic">No commits yet. Run your first native commit to trigger simple-git logging.</div>
                            ) : (
                                gitHistory.map((commit, idx) => (
                                    <div key={idx} className="p-3 bg-dark-900/80 border border-white/5 rounded-xl hover:bg-white/5 transition-colors group">
                                        <div className="flex items-center justify-between mb-1.5">
                                            <span className="text-xs font-mono text-primary-400">{commit.hash?.substring(0, 7) || 'HEAD'}</span>
                                            <span className="text-[10px] text-gray-500">{new Date(commit.date).toLocaleDateString()}</span>
                                        </div>
                                        <div className="text-sm text-gray-300 font-medium truncate">{commit.message}</div>
                                        <div className="text-[10px] text-gray-500 mt-1 flex items-center gap-1.5">
                                            <div className="w-3 h-3 rounded-full bg-accent-purple/20 border border-accent-purple/50 flex flex-col items-center justify-center text-[6px] text-white">
                                                {(commit.author_name || 'A').charAt(0).toUpperCase()}
                                            </div>
                                            {commit.author_name}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}
            </AnimatedCard>
        </div>
    );
};


