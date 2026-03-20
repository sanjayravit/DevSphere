import React, { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { io } from 'socket.io-client';
import api from '../services/api';
import { AnimatedCard } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Play, Sparkles, Bug, Zap } from 'lucide-react';

const socket = io('http://localhost:5000');

export const CodeEditorPage = () => {
    const [code, setCode] = useState('// Welcome to DevSphere Collaborative Editor\n// Start typing here...');
    const [output, setOutput] = useState('');
    const [isRunning, setIsRunning] = useState(false);
    const [aiSuggestions, setAiSuggestions] = useState('');
    const [isAiLoading, setIsAiLoading] = useState(false);
    const editorRef = useRef(null);

    useEffect(() => {
        socket.on('code-update', (newCode) => {
            setCode(newCode);
        });

        return () => {
            socket.off('code-update');
        };
    }, []);

    const handleEditorChange = (value) => {
        setCode(value);
        socket.emit('code-change', value);
    };

    const handleEditorDidMount = (editor) => {
        editorRef.current = editor;
    };

    const executeCode = async () => {
        setIsRunning(true);
        try {
            const res = await api.post('/code/run', { code });

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
        setIsAiLoading(true);
        setAiSuggestions('');
        try {
            const selectedCode = editorRef.current?.getModel().getValueInRange(editorRef.current?.getSelection());
            const codeToSend = selectedCode || code;

            const promptContext = action === 'explain'
                ? 'Explain the following code'
                : action === 'fix'
                    ? 'Find and fix bugs in this code'
                    : 'Optimize the following code';

            // Call AI endpoint
            const res = await api.post('/ai/code-help', {
                code: `${promptContext}:\n\n${codeToSend}`
            });

            setAiSuggestions(res.data.suggestion || res.data.message || 'AI analyzing complete.');
        } catch (err) {
            setAiSuggestions(`AI Assistant Error: ${err.message}`);
        } finally {
            setIsAiLoading(false);
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
                    <Button onClick={executeCode} isLoading={isRunning} className="gap-2 bg-green-500 hover:bg-green-600 text-white shadow-none">
                        <Play size={16} /> Run Code
                    </Button>
                </div>

                <AnimatedCard className="flex-1 p-0 overflow-hidden border border-white/10 rounded-2xl relative">
                    <div className="absolute top-0 left-0 w-full h-10 bg-dark-900 border-b border-white/10 flex items-center px-4 gap-2 z-10">
                        <div className="flex gap-1.5">
                            <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
                            <div className="w-3 h-3 rounded-full bg-yellow-500/80"></div>
                            <div className="w-3 h-3 rounded-full bg-green-500/80"></div>
                        </div>
                        <div className="text-xs text-gray-500 ml-4 font-mono">main.js</div>
                    </div>
                    <div className="pt-10 h-full">
                        <Editor
                            height="100%"
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
                            loading={<div className="h-full flex items-center justify-center text-gray-500">Loading Editor...</div>}
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

            {/* AI Assistant Sidebar */}
            <AnimatedCard className="w-full lg:w-80 flex flex-col shrink-0 h-full border border-primary-500/20 shadow-[inset_0_0_20px_rgba(99,102,241,0.05)] bg-dark-800/80 backdrop-blur-2xl">
                <div className="flex items-center gap-2 mb-6 text-primary-400">
                    <Sparkles size={20} />
                    <h2 className="text-lg font-bold text-white">AI Co-pilot</h2>
                </div>

                <div className="grid grid-cols-1 gap-3 mb-6">
                    <Button variant="secondary" size="sm" onClick={() => askAi('explain')} className="justify-start gap-3 w-full border-white/5 hover:border-primary-500/50 hover:text-primary-400">
                        <Sparkles size={16} /> Explain Code
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => askAi('fix')} className="justify-start gap-3 w-full border-white/5 hover:border-red-500/50 hover:text-red-400">
                        <Bug size={16} /> Find Bugs
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => askAi('optimize')} className="justify-start gap-3 w-full border-white/5 hover:border-yellow-500/50 hover:text-yellow-400">
                        <Zap size={16} /> Optimize
                    </Button>
                </div>

                <div className="flex-1 bg-dark-900/50 rounded-xl border border-white/5 p-4 overflow-auto custom-scrollbar">
                    {isAiLoading ? (
                        <div className="flex flex-col items-center justify-center h-full text-primary-400 space-y-4">
                            <Sparkles className="animate-spin" />
                            <p className="text-sm font-medium animate-pulse">Analyzing code...</p>
                        </div>
                    ) : aiSuggestions ? (
                        <div className="prose prose-invert prose-sm text-gray-300">
                            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{aiSuggestions}</pre>
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-gray-500 text-center px-4">
                            <Sparkles size={24} className="mb-2 opacity-50" />
                            <p className="text-sm">Highlight code and click an action above to get AI assistance.</p>
                        </div>
                    )}
                </div>
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
