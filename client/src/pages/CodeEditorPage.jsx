import React, { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { createInlineCompletions } from '../utils/inlineCompletions';
import { captureSelection, applyReplacement } from '../utils/editorChanges';
import socket from '../services/socket';
import api from '../services/api';
import { AnimatedCard } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Play, Sparkles, Bug, Zap, MessageSquare, Users, Send, Save, FileCode, GitCommit, GitBranch, Code2, Trash2, Loader2, Plus, X, Minimize2, Maximize2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';

function useLatest(value) {
    const ref = useRef(value);
    ref.current = value;
    return ref;
}

const LANGUAGES = {
    javascript: { id: 63, name: 'JavaScript', extension: 'js' },
    python: { id: 71, name: 'Python', extension: 'py' },
    java: { id: 62, name: 'Java', extension: 'java' },
    cpp: { id: 54, name: 'C++', extension: 'cpp' },
    c: { id: 50, name: 'C', extension: 'c' },
    html: { id: 0, name: 'HTML', extension: 'html' },
    css: { id: 0, name: 'CSS', extension: 'css' },
    typescript: { id: 74, name: 'TypeScript', extension: 'ts' },
    rust: { id: 73, name: 'Rust', extension: 'rs' },
    go: { id: 60, name: 'Go', extension: 'go' },
    php: { id: 68, name: 'PHP', extension: 'php' },
    ruby: { id: 72, name: 'Ruby', extension: 'rb' },
    csharp: { id: 51, name: 'C#', extension: 'cs' },
    kotlin: { id: 78, name: 'Kotlin', extension: 'kt' },
    swift: { id: 83, name: 'Swift', extension: 'swift' },
    shell: { id: 46, name: 'Bash', extension: 'sh' },
    sql: { id: 82, name: 'SQL', extension: 'sql' },
    json: { id: 0, name: 'JSON', extension: 'json' },
    markdown: { id: 0, name: 'Markdown', extension: 'md' },
    yaml: { id: 0, name: 'YAML', extension: 'yaml' },
    xml: { id: 0, name: 'XML', extension: 'xml' },
};

// Map file extensions → Monaco editor language IDs
const EXTENSION_TO_LANGUAGE = {
    js: 'javascript',
    jsx: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    py: 'python',
    java: 'java',
    cpp: 'cpp',
    cc: 'cpp',
    cxx: 'cpp',
    c: 'c',
    h: 'c',
    cs: 'csharp',
    go: 'go',
    rb: 'ruby',
    rs: 'rust',
    php: 'php',
    swift: 'swift',
    kt: 'kotlin',
    html: 'html',
    htm: 'html',
    css: 'css',
    scss: 'scss',
    less: 'less',
    json: 'json',
    md: 'markdown',
    yaml: 'yaml',
    yml: 'yaml',
    xml: 'xml',
    sh: 'shell',
    bash: 'shell',
    sql: 'sql',
};

// Get the default starter comment for a given language
const getDefaultContent = (lang) => {
    const commentMap = {
        python: '# New file\n',
        html: '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8" />\n  <title>Document</title>\n</head>\n<body>\n\n</body>\n</html>\n',
        css: '/* styles */\n',
        sql: '-- SQL queries\n',
        shell: '#!/bin/bash\n',
        markdown: '# Title\n',
        json: '{}\n',
        yaml: '# YAML config\n',
        xml: '<?xml version="1.0" encoding="UTF-8"?>\n',
    };
    return commentMap[lang] || `// New file\n`;
};

// Detect language from a filename
const detectLanguage = (filename) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    return EXTENSION_TO_LANGUAGE[ext] || 'javascript';
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

    // New file modal state
    const [isNewFileModalOpen, setIsNewFileModalOpen] = useState(false);
    const [newFileName, setNewFileName] = useState('');
    const [newFileNameError, setNewFileNameError] = useState('');

    const [aiChatInput, setAiChatInput] = useState('');
    const [aiHistory, setAiHistory] = useState([]);
    const [isAiLoading, setIsAiLoading] = useState(false);

    // Git State
    const [gitHistory, setGitHistory] = useState([]);
    const [commitMessage, setCommitMessage] = useState('');
    const [isCommitting, setIsCommitting] = useState(false);

    // Collaboration & UI state
    const { user, token } = useAuth();
    const workspaceContext = useWorkspace();
    const [editorError, setEditorError] = useState('');
    const latestActiveFile = useLatest(activeFileIndex);
    const latestFiles = useLatest(files);
    const scope = useRef(null);
    const scopeKey = JSON.stringify([user?.id || '', projectId || '']);
    if (scope.current?.key !== scopeKey) scope.current = { key: scopeKey, projectId };
    const mounted = useRef(true);
    const isCurrent = snapshot => mounted.current && scope.current === snapshot;
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    const [messages, setMessages] = useState([]);
    const [roomUsers, setRoomUsers] = useState([]);
    const [isTerminalVisible, setIsTerminalVisible] = useState(false);
    const [chatInput, setChatInput] = useState('');
    const [typingUsers, setTypingUsers] = useState({});
    const typingTimeoutRef = useRef(null);
    const [activeTab, setActiveTab] = useState('chat'); // 'chat', 'ai', 'git'
    const [isExplorerMinimized, setIsExplorerMinimized] = useState(false);
    const [targetLanguage, setTargetLanguage] = useState('python');
    const cursorsRef = useRef({});
    const decorationsRef = useRef([]);
    const chatContainerRef = useRef(null);
    const outputRef = useRef(null);

    const editorRef = useRef(null);
    const monacoRef = useRef(null);
    const latestUser = useLatest(user);
    const [editorReady, setEditorReady] = useState(false);
    const cursorSubscription = useRef(null);
    const emitCodeChange = useRef(null);

    // Initial setup of debounce function
    useEffect(() => {
        let timeout;
        emitCodeChange.current = (roomId, value, index) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                if (socket) socket.emit('code-change', { roomId, code: { code: value, fileIndex: index } });
            }, 300);
        };
        return () => clearTimeout(timeout);
    }, [projectId, user?.id]);

    // Initial project schema fetching
    useEffect(() => {
        const snapshot = scope.current;
        const controller = new AbortController();
        setProject(null); setFiles([]); setCode(''); setAiHistory([]); setActiveFileIndex(0); setEditorError('');
        setGitHistory([]); setMessages([]); setRoomUsers([]); setTypingUsers({}); setOutput('');
        setIsAiLoading(false); setIsSaving(false); setIsCommitting(false); setIsRunning(false);
        clearTimeout(typingTimeoutRef.current); cursorsRef.current = {};
        if (!projectId || !user?.id || !token) return () => controller.abort();
        api.get(`/projects/${projectId}`, { signal: controller.signal }).then(res => {
            if (controller.signal.aborted || !isCurrent(snapshot)) return;
            setProject(res.data);
            workspaceContext?.setActiveProject(res.data);
            if (res.data.chatHistory) {
                setAiHistory(res.data.chatHistory);
            }
            if (res.data.files && res.data.files.length > 0) {
                setFiles(res.data.files);
                setCode(res.data.files[0].content);
                setLanguage(res.data.files[0].language || detectLanguage(res.data.files[0].name));
            }
            fetchGitHistory();
        }).catch(err => { if (!controller.signal.aborted && isCurrent(snapshot)) setEditorError(err.response?.data?.error || 'Could not load this project.'); });
        return () => controller.abort();
    }, [projectId, user?.id, Boolean(token)]);

    const fetchGitHistory = async () => {
        const snapshot = scope.current;
        try {
            const res = await api.get(`/git/${projectId}/history`);
            if (isCurrent(snapshot)) setGitHistory(res.data || []);
        } catch (err) {
            if (isCurrent(snapshot)) setEditorError('Git history is unavailable.');
        }
    };

    useEffect(() => {
        if (!projectId || project?.id !== projectId || !token) return;
        const join = () => socket.emit('join-room', { roomId: projectId });
        socket.on('connect', join);
        socket.on('collaboration:error', () => setEditorError('Collaboration access was denied or the update was invalid.'));
        if (socket.connected) join(); else socket.connect();

        socket.on('code-update', (incomingPayload) => {
            // Unpack generic updates versus explicitly indexed file broadcasts
            const isLegacy = typeof incomingPayload === 'string';
            const newCode = isLegacy ? incomingPayload : incomingPayload.code;
            const fileIndex = isLegacy ? latestActiveFile.current : incomingPayload.fileIndex;
            if (!Number.isInteger(fileIndex) || typeof newCode !== 'string') return;

            // Only update local view if we are on the exact same active tab as the incoming file signal
            if (latestActiveFile.current === fileIndex || isLegacy) {
                setCode(newCode);
            }

            setFiles(prev => {
                const updated = [...prev];
                if (updated[fileIndex]) updated[fileIndex] = { ...updated[fileIndex], content: newCode };
                else if (fileIndex === updated.length && typeof incomingPayload.fileName === 'string') updated.push({ name: incomingPayload.fileName, content: newCode, language: incomingPayload.language || detectLanguage(incomingPayload.fileName) });
                return updated;
            });
        });

        socket.on('chat-update', (message) => {
            setMessages(prev => [...prev, message]);
        });

        socket.on('user-joined', ({ socketId, user: joinedUser }) => {
            setMessages(prev => [...prev, { system: true, text: `${joinedUser?.name || 'A user'} joined the workspace.` }]);
        });

        socket.on('room-users-update', (users) => {
            setRoomUsers(users);
        });

        socket.on('user-left', (socketId) => {
            removeCursor(socketId);
        });

        socket.on('cursor-update', ({ socketId, line, column, user: cursorUser }) => {
            updateCursor(socketId, line, column, cursorUser);
        });

        socket.on('ai-update', (aiMessage) => {
            // Check if it's already in history to avoid double local append for the sender
            setAiHistory(prev => [...prev, aiMessage]);
        });

        socket.on('user-typing-update', ({ socketId, user: typingUser, isTyping }) => {
            setTypingUsers(prev => {
                const next = { ...prev };
                if (isTyping) next[socketId] = typingUser;
                else delete next[socketId];
                return next;
            });
        });

        return () => {
            socket.emit('leave-room', { roomId: projectId });
            socket.off('connect', join);
            socket.off('collaboration:error');
            socket.off('code-update');
            socket.off('chat-update');
            socket.off('user-joined');
            socket.off('room-users-update');
            socket.off('user-left');
            socket.off('cursor-update');
            socket.off('ai-update');
            socket.off('user-typing-update');

            // Cleanup cursor styles
            const styleTag = document.getElementById('cursor-styles');
            if (styleTag) styleTag.remove();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectId, project?.id, token, latestUser, latestActiveFile]);

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
            const name = (cursorUser?.name?.split(' ')[0] || 'User').replace(/[^a-zA-Z0-9 _-]/g, '').slice(0, 40);
            if (!/^[a-zA-Z0-9_-]+$/.test(id)) return;

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
        styleTag.textContent = css;
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

        const snapshot = scope.current; const model = editorRef.current.getModel(); const controller = new AbortController();
        const lintTimer = setTimeout(async () => {
            try {
                const res = await api.post('/ai/copilot', {
                    action: 'lint',
                    code,
                    projectId
                }, { signal: controller.signal });
                if (!isCurrent(snapshot) || controller.signal.aborted || editorRef.current?.getModel() !== model) return;

                let rawRes = res.data.result.trim();
                rawRes = rawRes.replace(/^\`\`\`(json)?/i, '').replace(/\`\`\`$/i, '').trim();

                let issues = [];
                try {
                    issues = JSON.parse(rawRes);
                } catch (e) { } // Ignore if AI spits out conversational garbage natively

                if (Array.isArray(issues) && monacoRef.current) {
                    const markers = issues.filter(issue => Number.isInteger(issue.line) && issue.line > 0 && issue.line <= model.getLineCount() && typeof issue.message === 'string').slice(0, 100).map(issue => ({
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
                // Diagnostics are advisory; failed or obsolete responses never become compiler results.
            }
        }, 2000); // 2-second debounce for snappy diagnostic mapping

        return () => { clearTimeout(lintTimer); controller.abort(); };
    }, [code, projectId, activeFileIndex, user?.id]);

    const handleEditorChange = (value) => {
        setCode(value);
        if (emitCodeChange.current) {
            emitCodeChange.current(projectId, value, activeFileIndex);
        }

        setFiles(prev => {
            const next = [...prev];
            if (next[activeFileIndex]) next[activeFileIndex] = { ...next[activeFileIndex], content: value || "" };
            return next;
        });
    };

    const handleSave = async () => {
        if (!projectId || project?.id !== projectId || isSaving) return false;
        const snapshot = scope.current;
        setIsSaving(true);
        try {
            const response = await api.put(`/projects/${projectId}/files`, { files, version: project?.version || 0 });
            if (!isCurrent(snapshot)) return false;
            setProject(response.data); setEditorError('');
            return true;
        } catch (err) {
            if (isCurrent(snapshot)) setEditorError(err.response?.data?.error || 'Save failed. Your local edits have not been persisted.');
            return false;
        } finally {
            if (isCurrent(snapshot)) setIsSaving(false);
        }
    };

    const handleTabSwitch = (index) => {
        setActiveFileIndex(index);
        setCode(files[index].content);
        setLanguage(files[index].language);
        // Switching a tab is not an edit; never overwrite a collaborator's file.
    };

    const handleOpenNewFileModal = () => {
        setNewFileName('');
        setNewFileNameError('');
        setIsNewFileModalOpen(true);
    };

    const handleCreateNewFile = (e) => {
        e.preventDefault();
        const trimmed = newFileName.trim();
        if (!trimmed) {
            setNewFileNameError('Please enter a file name.');
            return;
        }
        if (!trimmed.includes('.') || /(^|\/)(\.\.?|\.git)(\/|$)/i.test(trimmed) || /[\\:\x00-\x1f]/.test(trimmed) || trimmed.startsWith('/')) {
            setNewFileNameError('Include an extension (e.g. app.py, index.html).');
            return;
        }
        // Prevent duplicate names
        if (files.some(f => f.name === trimmed)) {
            setNewFileNameError(`A file named "${trimmed}" already exists.`);
            return;
        }
        const detectedLang = detectLanguage(trimmed);
        const content = getDefaultContent(detectedLang);
        const newFile = { name: trimmed, content, language: detectedLang };
        const newFiles = [...files, newFile];
        const newIndex = newFiles.length - 1;
        setFiles(newFiles);
        setActiveFileIndex(newIndex);
        setCode(content);
        setLanguage(detectedLang);
        setIsNewFileModalOpen(false);
        setNewFileName('');
        if (socket) {
            socket.emit('code-change', { roomId: projectId, code: { code: content, fileIndex: newIndex, fileName: trimmed, language: detectedLang } });
        }
    };

    const handleEditorDidMount = (editor, monaco) => {
        editorRef.current = editor;
        monacoRef.current = monaco;

        setEditorReady(true);
        cursorSubscription.current?.dispose();
        cursorSubscription.current = editor.onDidChangeCursorPosition((e) => {
            if (socket) {
                socket.emit('cursor-change', {
                    roomId: scope.current.projectId,
                    cursorData: {
                        line: e.position.lineNumber,
                        column: e.position.column,
                        user: latestUser.current || { name: 'Anonymous' }
                    }
                });
            }
        });
    };

    useEffect(() => {
        if (!editorReady || project?.id !== projectId || !token) return undefined;
        const provider = createInlineCompletions({
            request: (body, options) => api.post('/ai/copilot', body, options), monaco: monacoRef.current,
            getSnapshot: () => scope.current, isCurrent, getModel: () => editorRef.current?.getModel()
        });
        const registration = monacoRef.current.languages.registerInlineCompletionsProvider(language, provider);
        return () => { provider.dispose(); registration.dispose(); };
    }, [language, editorReady, projectId, project?.id, user?.id, token]);
    useEffect(() => () => { cursorSubscription.current?.dispose(); clearTimeout(typingTimeoutRef.current); }, []);

    const handleSendMessage = (e) => {
        e.preventDefault();
        if (!chatInput.trim()) return;

        const message = {
            id: Date.now().toString(),
            text: chatInput,
            user: latestUser.current || { name: 'Anonymous' },
            timestamp: new Date().toISOString()
        };

        socket.emit('chat-message', { roomId: projectId, message });
        setMessages(prev => [...prev, message]);
        setChatInput('');
        if (socket) {
            socket.emit('user-typing', { roomId: projectId, user: latestUser.current || { name: 'Anonymous' }, isTyping: false });
        }
    };

    const handleTyping = (e) => {
        setChatInput(e.target.value);
        if (socket) {
            socket.emit('user-typing', { roomId: projectId, user: latestUser.current || { name: 'Anonymous' }, isTyping: true });
            clearTimeout(typingTimeoutRef.current);
            typingTimeoutRef.current = setTimeout(() => {
                socket.emit('user-typing', { roomId: projectId, user: latestUser.current || { name: 'Anonymous' }, isTyping: false });
            }, 2000);
        }
    };

    const executeCode = async () => {
        if (isRunning) return;
        const snapshot = scope.current;
        setIsRunning(true);
        setIsTerminalVisible(true);
        try {
            const res = await api.post('/code/run', {
                code,
                language_id: LANGUAGES[language]?.id ?? 0
            });

            if (!isCurrent(snapshot)) return;
            // The backend returns the actual remote execution result.
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
            if (isCurrent(snapshot)) setOutput(`Error executing code:\n${err.response?.data?.error || err.message}`);
        } finally {
            if (isCurrent(snapshot)) setIsRunning(false);
        }
    };

    const handleAiChat = async (e) => {
        e.preventDefault();
        if (!aiChatInput.trim() || isAiLoading) return;
        const snapshot = scope.current;

        const userMsg = aiChatInput;
        setAiChatInput('');
        const userAiMessage = { role: 'user', content: userMsg };
        setAiHistory(prev => [...prev, userAiMessage]);
        if (socket) {
            socket.emit('ai-response', { roomId: projectId, message: userAiMessage });
        }
        setIsAiLoading(true);

        const isProjectQuery = userMsg.toLowerCase().startsWith('/project ');
        const actionPayload = isProjectQuery ? 'project-query' : 'chat';
        const cleanedMsg = isProjectQuery ? userMsg.slice(9) : userMsg;

        try {
            const selectedCode = editorRef.current?.getModel().getValueInRange(editorRef.current?.getSelection());
            const codeToSend = selectedCode || code;

            const res = await api.post('/ai/agent', {
                action: actionPayload,
                message: cleanedMsg,
                code: codeToSend,
                projectId
            });

            if (!isCurrent(snapshot)) return;
            const modelMessage = { role: 'model', content: res.data.result };
            setAiHistory(prev => [...prev, modelMessage]);
            if (socket) {
                socket.emit('ai-response', { roomId: projectId, message: modelMessage });
            }
        } catch (err) {
            if (!isCurrent(snapshot)) return;
            const errorMessage = { role: 'model', content: `Error: ${err.response?.data?.error || err.message}` };
            setAiHistory(prev => [...prev, errorMessage]);
            if (socket) {
                socket.emit('ai-response', { roomId: projectId, message: errorMessage });
            }
        } finally {
            if (isCurrent(snapshot)) setIsAiLoading(false);
        }
    };

    const handleAiAction = async (action) => {
        if (isAiLoading || project?.id !== projectId || !files[activeFileIndex]) return;
        const snapshot = scope.current;
        const sourceFile = { ...files[activeFileIndex] }; const sourceIndex = activeFileIndex;
        const selection = captureSelection(editorRef.current, sourceFile.content);
        setEditorError(''); setIsAiLoading(true);
        const actionStartMsg = { role: 'user', content: `Run AI Action: ${action}` };
        setAiHistory(prev => [...prev, actionStartMsg]);
        if (socket) {
            socket.emit('ai-response', { roomId: projectId, message: actionStartMsg });
        }

        try {
            const res = await api.post('/ai/agent', {
                action: action,
                code: selection?.text || sourceFile.content,
                projectId,
                targetLanguage: action === 'convert' ? targetLanguage : undefined
            });

            if (!isCurrent(snapshot)) return;
            let modelResponse = "";
            if (action === "optimize" || action === "optimise" || action === "refactor" || action === "convert") {
                const current = latestFiles.current[sourceIndex];
                if (!current || current.name !== sourceFile.name || current.content !== sourceFile.content || current.language !== sourceFile.language) {
                    setEditorError('The file changed while AI was working. Its response was not applied; review it below or retry.');
                    modelResponse = `Not applied: the file changed while AI was working.\n${res.data.result || ''}`;
                } else {
                    const replacement = applyReplacement(sourceFile.content, res.data.result, selection);
                    const nextLanguage = action === 'convert' && !selection ? targetLanguage : sourceFile.language;
                    setFiles(previous => previous.map((file, index) => index === sourceIndex ? { ...file, content: replacement, language: nextLanguage } : file));
                    if (latestActiveFile.current === sourceIndex) { setCode(replacement); setLanguage(nextLanguage); }
                    socket.emit('code-change', { roomId: projectId, code: { code: replacement, fileIndex: sourceIndex } });
                    modelResponse = `AI replacement applied to ${sourceFile.name}${selection ? ' (selected text only)' : ''}. Save to persist; this is not an executed test or code review.`;
                }
            } else {
                modelResponse = res.data.result;
            }

            const actionResultMsg = { role: 'model', content: modelResponse };
            setAiHistory(prev => [...prev, actionResultMsg]);
            if (socket) {
                socket.emit('ai-response', { roomId: projectId, message: actionResultMsg });
            }
        } catch (err) {
            if (!isCurrent(snapshot)) return;
            const errorMsg = { role: 'model', content: `Error: ${err.response?.data?.error || err.message}` };
            setAiHistory(prev => [...prev, errorMsg]);
            if (socket) {
                socket.emit('ai-response', { roomId: projectId, message: errorMsg });
            }
        } finally {
            if (isCurrent(snapshot)) setIsAiLoading(false);
        }
    };

    const handleGitCommit = async (e) => {
        e.preventDefault();
        if (isCommitting || !commitMessage.trim()) return;
        const snapshot = scope.current;
        setIsCommitting(true);
        try {
            // Auto-save before commit to ensure DB matches editor State
            if (!await handleSave() || !isCurrent(snapshot)) return;
            const res = await api.post(`/git/${projectId}/commit`, { message: commitMessage });

            if (!isCurrent(snapshot)) return;
            if (res.data.success) {
                setCommitMessage('');
                fetchGitHistory();
                if (res.data.aiReview) {
                    // System echo the AI review into workspace chat for team visibility
                    setMessages(prev => [...prev, { system: true, text: `AI Code Review Complete for commit: ${res.data.commitId || 'latest'}` }]);
                }
            }
        } catch (err) {
            if (isCurrent(snapshot)) setEditorError(err.response?.data?.error || 'Commit failed; no successful commit was reported.');
        } finally {
            if (isCurrent(snapshot)) setIsCommitting(false);
        }
    };

    const handleLanguageChange = (event) => {
        const nextLanguage = event.target.value;
        if (!Object.hasOwn(LANGUAGES, nextLanguage)) return;
        // Changing syntax highlighting must not silently rewrite real source or string literals.
        const nextCode = Object.values(DEFAULT_TEMPLATES).some(template => code === template)
            ? DEFAULT_TEMPLATES[nextLanguage] || getDefaultContent(nextLanguage) : code;
        setLanguage(nextLanguage); setCode(nextCode);
        setFiles(previous => previous.map((file, index) => index === activeFileIndex ? { ...file, language: nextLanguage, content: nextCode } : file));
        if (nextCode !== code) socket.emit('code-change', { roomId: projectId, code: { code: nextCode, fileIndex: activeFileIndex } });
    };

    return (
        <div className="h-[calc(100vh-100px)] flex flex-col lg:flex-row gap-4 lg:gap-6">
            {editorError && <div role="alert" className="absolute top-0 left-0 right-0 z-50 bg-red-950 p-3 text-sm text-red-200">{editorError}</div>}
            {/* Left Sidebar: File Explorer */}
            <AnimatedCard className={`hidden lg:flex flex-col shrink-0 border border-white/10 bg-dark-800/80 p-4 transition-all duration-300 ${isExplorerMinimized ? 'w-16 h-fit items-center cursor-pointer hover:bg-dark-700/80' : 'w-fit min-w-[200px] max-w-[300px] h-fit max-h-full'}`} onClick={() => isExplorerMinimized && setIsExplorerMinimized(false)}>
                {isExplorerMinimized ? (
                    <div className="flex flex-col items-center gap-4 py-2" title="Maximize Explorer">
                        <FileCode size={20} className="text-primary-400" />
                    </div>
                ) : (
                    <>
                        <div className="flex items-center justify-between mb-4 gap-6 shrink-0">
                            <h3 className="text-white font-semibold text-sm uppercase tracking-widest flex items-center gap-2">
                                <FileCode size={16} className="text-primary-400" /> Explorer
                            </h3>
                            <div className="flex items-center gap-2 opacity-0 lg:opacity-100">
                                <button onClick={handleOpenNewFileModal} className="text-primary-400 hover:text-white transition-colors" title="New File">
                                    <Plus size={16} />
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); setIsExplorerMinimized(true); }} className="text-gray-500 hover:text-white transition-colors" title="Minimize Explorer">
                                    <Minimize2 size={16} />
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-1 pr-1">
                            {files.map((file, index) => (
                                <button
                                    key={index}
                                    onClick={() => handleTabSwitch(index)}
                                    className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-all ${activeFileIndex === index ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30 shadow-sm' : 'hover:bg-white/5 text-gray-400'}`}
                                >
                                    <span className="truncate">{file.name}</span>
                                </button>
                            ))}
                        </div>
                    </>
                )}
            </AnimatedCard>

            {/* Center: Editor Main Area */}
            <div className="flex-[2] flex flex-col gap-4 h-full min-w-0">
                <div className="flex items-center justify-between shrink-0">
                    <div>
                        <h1 className="text-2xl font-display font-bold text-white uppercase tracking-wider">{project?.name || 'Project File'}</h1>
                        <p className="text-sm text-gray-400">Collaborative Workspace • {files.length} File(s)</p>
                    </div>
                    <div className="flex gap-4 items-center">
                        <div className="flex -space-x-2 mr-2">
                            {roomUsers.map((u, i) => (
                                <div key={u.socketId || i} className="w-8 h-8 rounded-full border-2 border-dark-900 bg-primary-500/20 text-primary-400 flex items-center justify-center text-xs font-bold uppercase shadow-sm" title={u.user?.name || 'Anonymous'}>
                                    {(u.user?.name || 'A').charAt(0)}
                                </div>
                            ))}
                        </div>
                        <Button variant="secondary" onClick={handleSave} isLoading={isSaving} className="gap-2 border-white/10 hover:border-primary-500/50 bg-dark-800 hidden sm:flex">
                            <Save size={16} className={isSaving ? 'animate-pulse' : ''} /> Save to Cloud
                        </Button>
                        <select
                            aria-label="Editor language"
                            value={language}
                            onChange={handleLanguageChange}
                            className="bg-dark-800 border border-white/10 text-white text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-primary-500 transition-colors"
                        >
                            {Object.entries(LANGUAGES).map(([key, lang]) => (
                                <option key={key} value={key} className="bg-dark-900 text-white">{lang.name}</option>
                            ))}
                        </select>
                        <Button variant="secondary" onClick={() => setIsTerminalVisible(prev => !prev)} className={`gap-2 border-white/10 bg-dark-800 p-2 sm:px-4 sm:py-2.5 ${isTerminalVisible ? 'border-primary-500/50 text-primary-400' : 'hover:border-primary-500/50'}`} title="Toggle Terminal">
                            <TerminalSquare size={16} /> <span className="hidden sm:inline">Terminal</span>
                        </Button>
                        <Button onClick={executeCode} isLoading={isRunning} className="gap-2 bg-green-500 hover:bg-green-600 text-white shadow-none">
                            <Play size={16} /> Run Code
                        </Button>
                    </div>
                </div>

                <AnimatedCard className="flex-1 p-0 overflow-hidden border border-white/10 rounded-2xl relative">
                    {/* Mobile File Explorer Tabs */}
                    <div className="flex lg:hidden w-full overflow-x-auto custom-scrollbar bg-dark-950 border-b border-white/10">
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
                        <button
                            onClick={handleOpenNewFileModal}
                            className="flex items-center gap-1.5 px-4 py-3 font-mono text-xs text-gray-500 hover:text-primary-400 hover:bg-dark-800/60 transition-colors border-r border-white/5 shrink-0"
                        >
                            <Plus size={14} /> New
                        </button>
                    </div>

                    {/* New File Modal */}
                    {isNewFileModalOpen && (
                        <div className="absolute inset-0 z-50 flex items-center justify-center bg-dark-950/80 backdrop-blur-sm">
                            <div className="bg-dark-800 border border-white/10 rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-white font-semibold text-base flex items-center gap-2">
                                        <FileCode size={16} className="text-primary-400" /> New File
                                    </h3>
                                    <button onClick={() => setIsNewFileModalOpen(false)} className="text-gray-500 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/5">
                                        <X size={16} />
                                    </button>
                                </div>
                                <form onSubmit={handleCreateNewFile} className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">File Name</label>
                                        <input
                                            type="text"
                                            autoFocus
                                            value={newFileName}
                                            onChange={e => { setNewFileName(e.target.value); setNewFileNameError(''); }}
                                            placeholder="e.g. app.py, index.html, server.js"
                                            className="w-full bg-dark-900/80 border border-white/10 text-white text-sm rounded-xl px-4 py-3 focus:outline-none focus:border-primary-500 placeholder-gray-600 transition-colors"
                                        />
                                        {newFileNameError && (
                                            <p className="text-red-400 text-xs mt-1.5">{newFileNameError}</p>
                                        )}
                                        {newFileName.includes('.') && !newFileNameError && (
                                            <p className="text-primary-400/70 text-xs mt-1.5">
                                                Detected language: <span className="font-semibold text-primary-400">{detectLanguage(newFileName)}</span>
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex gap-3">
                                        <button type="button" onClick={() => setIsNewFileModalOpen(false)} className="flex-1 py-2.5 rounded-xl border border-white/10 text-gray-400 hover:text-white hover:bg-white/5 text-sm transition-colors">
                                            Cancel
                                        </button>
                                        <button type="submit" className="flex-1 py-2.5 rounded-xl bg-primary-500 hover:bg-primary-400 text-white text-sm font-medium transition-colors">
                                            Create File
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    )}
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
                <AnimatePresence>
                    {isTerminalVisible && (
                        <motion.div
                            initial={{ height: 0, opacity: 0, marginTop: 0 }}
                            animate={{ height: 224, opacity: 1, marginTop: 16 }}
                            exit={{ height: 0, opacity: 0, marginTop: 0 }}
                            transition={{ duration: 0.3, ease: 'easeInOut' }}
                            className="overflow-hidden shrink-0"
                        >
                            <AnimatedCard className="h-full bg-[#0a0a0f] text-green-400 font-mono text-sm flex flex-col border border-white/5 rounded-xl overflow-hidden">
                                {/* Terminal Header */}
                                <div className="flex items-center justify-between px-4 py-2.5 bg-dark-800/80 border-b border-white/5 shrink-0">
                                    <div className="flex items-center gap-3">
                                        <div className="flex gap-1.5">
                                            <div className="w-3 h-3 rounded-full bg-red-500/80 cursor-pointer" onClick={() => setIsTerminalVisible(false)} title="Close Terminal" />
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
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Right Sidebar: AI Panel & Chat */}
            <AnimatedCard className="w-full lg:w-80 xl:w-96 flex flex-col shrink-0 h-[600px] lg:h-full border border-primary-500/20 shadow-[inset_0_0_20px_rgba(99,102,241,0.05)] bg-dark-800/80 backdrop-blur-2xl p-4">
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
                            {Object.keys(typingUsers).length > 0 && (
                                <div className="text-[10px] text-primary-400 italic px-2 animate-pulse mt-2 transition-all">
                                    {Object.values(typingUsers).map(u => u.name?.split(' ')[0] || 'Someone').join(', ')} {Object.keys(typingUsers).length > 1 ? 'are' : 'is'} typing...
                                </div>
                            )}
                        </div>
                        <div className="absolute bottom-0 left-0 w-full pt-2 pb-1 bg-dark-800">
                            <form onSubmit={handleSendMessage} className="relative">
                                <input
                                    type="text"
                                    value={chatInput}
                                    onChange={handleTyping}
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
                                <Button type="submit" isLoading={isCommitting} disabled={isCommitting || !commitMessage.trim()} className="w-full justify-center gap-2 py-2 text-sm">
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
                                            <span className="text-[10px] text-gray-500">{commit.date ? new Date(commit.date).toLocaleDateString() : 'Unknown'}</span>
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
        </div >
    );
};


