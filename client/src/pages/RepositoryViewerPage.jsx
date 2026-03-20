import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import Editor from '@monaco-editor/react';
import { AnimatedCard } from '../components/ui/Card';
import { Folder, File, Code, ArrowLeft, Loader2, Github } from 'lucide-react';

export const RepositoryViewerPage = () => {
    const { owner, repoName } = useParams();
    const navigate = useNavigate();

    const [fileTree, setFileTree] = useState([]);
    const [currentPath, setCurrentPath] = useState('');
    const [isLoadingTree, setIsLoadingTree] = useState(false);

    const [selectedFile, setSelectedFile] = useState(null);
    const [fileContent, setFileContent] = useState('');
    const [isLoadingFile, setIsLoadingFile] = useState(false);

    useEffect(() => {
        fetchDirectory('');
        // eslint-disable-next-line
    }, [owner, repoName]);

    const fetchDirectory = async (path) => {
        setIsLoadingTree(true);
        try {
            const url = path
                ? `https://api.github.com/repos/${owner}/${repoName}/contents/${path}`
                : `https://api.github.com/repos/${owner}/${repoName}/contents`;

            const res = await axios.get(url);

            // Sort folders first, then files
            const sortedItems = res.data.sort((a, b) => {
                if (a.type === b.type) return a.name.localeCompare(b.name);
                return a.type === 'dir' ? -1 : 1;
            });

            setFileTree(sortedItems);
            setCurrentPath(path);
        } catch (err) {
            console.error('Error fetching directory:', err);
        } finally {
            setIsLoadingTree(false);
        }
    };

    const fetchFileContent = async (fileNode) => {
        setIsLoadingFile(true);
        setSelectedFile(fileNode.name);
        try {
            const res = await axios.get(fileNode.download_url);
            // Handle raw content, ensuring it's text
            setFileContent(typeof res.data === 'object' ? JSON.stringify(res.data, null, 2) : String(res.data));
        } catch (err) {
            console.error('Error fetching file content:', err);
            setFileContent('// Error loading file content. It might be binary or unavailable.');
        } finally {
            setIsLoadingFile(false);
        }
    };

    const handleItemClick = (item) => {
        if (item.type === 'dir') {
            fetchDirectory(item.path);
        } else if (item.type === 'file') {
            fetchFileContent(item);
        }
    };

    const handleGoBack = () => {
        if (!currentPath) {
            navigate('/profile');
            return;
        }

        // Remove the last folder from the path
        const pathParts = currentPath.split('/');
        pathParts.pop();
        fetchDirectory(pathParts.join('/'));
    };

    const getEditorLanguage = (filename) => {
        if (!filename) return 'javascript';
        const ext = filename.split('.').pop().toLowerCase();
        const map = {
            'js': 'javascript', 'jsx': 'javascript', 'ts': 'typescript', 'tsx': 'typescript',
            'json': 'json', 'html': 'html', 'css': 'css', 'py': 'python',
            'java': 'java', 'c': 'c', 'cpp': 'cpp', 'md': 'markdown', 'go': 'go', 'rs': 'rust'
        };
        return map[ext] || 'plaintext';
    };

    return (
        <div className="h-[calc(100vh-100px)] flex flex-col gap-4">
            <div className="flex items-center justify-between pb-2 border-b border-white/10 shrink-0">
                <div className="flex items-center gap-4">
                    <button
                        onClick={handleGoBack}
                        className="p-2 hover:bg-white/5 text-gray-400 hover:text-white rounded-lg transition-colors border border-transparent hover:border-white/10"
                    >
                        <ArrowLeft size={18} />
                    </button>
                    <div>
                        <h1 className="text-xl font-display font-bold text-white flex items-center gap-2">
                            <Github className="text-gray-400" size={20} />
                            {owner} <span className="text-gray-500 font-light">/</span> {repoName}
                        </h1>
                        <p className="text-xs text-primary-400 mt-1 flex items-center gap-1.5">
                            <Folder size={12} fill="currentColor" className="text-primary-500/50" />
                            {currentPath || 'Root Details'}
                        </p>
                    </div>
                </div>
            </div>

            <div className="flex-1 flex gap-6 overflow-hidden">
                {/* File Tree Sidebar */}
                <AnimatedCard className="w-80 h-full flex flex-col p-0 overflow-hidden border border-white/10 bg-dark-900/50 shrink-0">
                    <div className="p-3 bg-dark-800 border-b border-white/5 font-medium text-sm text-gray-300 flex items-center gap-2">
                        <Code size={16} className="text-primary-400" /> Repository Files
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
                        {isLoadingTree ? (
                            <div className="flex items-center justify-center p-6 text-gray-500">
                                <Loader2 className="animate-spin" />
                            </div>
                        ) : (
                            <div className="space-y-1">
                                {fileTree.map((item) => (
                                    <button
                                        key={item.sha}
                                        onClick={() => handleItemClick(item)}
                                        className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-colors text-left
                                            ${selectedFile === item.name
                                                ? 'bg-primary-500/20 text-primary-300 border border-primary-500/30'
                                                : 'text-gray-300 hover:bg-white/5 border border-transparent hover:border-white/5'
                                            }`}
                                    >
                                        {item.type === 'dir' ? (
                                            <Folder size={16} fill="currentColor" className="text-accent-blue/80 shrink-0 mt-0.5" />
                                        ) : (
                                            <File size={16} className="text-gray-500 shrink-0 mt-0.5" />
                                        )}
                                        <span className="truncate">{item.name}</span>
                                    </button>
                                ))}
                                {fileTree.length === 0 && (
                                    <div className="text-center text-gray-500 text-sm mt-4">Empty Directory</div>
                                )}
                            </div>
                        )}
                    </div>
                </AnimatedCard>

                {/* Main Editor Viewer */}
                <AnimatedCard className="flex-1 h-full p-0 overflow-hidden border border-white/10 relative">
                    {selectedFile ? (
                        <>
                            <div className="absolute top-0 left-0 w-full h-10 bg-dark-900 border-b border-white/10 flex items-center px-4 gap-2 z-10">
                                <div className="text-xs text-gray-400 font-mono flex items-center gap-2">
                                    <File size={14} className="text-primary-400" />
                                    {selectedFile}
                                </div>
                            </div>
                            <div className="pt-10 h-full">
                                {isLoadingFile ? (
                                    <div className="h-full flex items-center justify-center text-gray-500 flex-col gap-3">
                                        <Loader2 className="animate-spin text-primary-500" size={32} />
                                        Fetching file source...
                                    </div>
                                ) : (
                                    <Editor
                                        height="100%"
                                        language={getEditorLanguage(selectedFile)}
                                        theme="vs-dark"
                                        value={fileContent}
                                        options={{
                                            readOnly: true,
                                            minimap: { enabled: true, scale: 0.75 },
                                            fontSize: 14,
                                            fontFamily: 'JetBrains Mono, monospace',
                                            padding: { top: 16 },
                                            smoothScrolling: true,
                                            renderWhitespace: "selection",
                                            scrollBeyondLastLine: false
                                        }}
                                        loading={<div className="h-full flex items-center justify-center text-gray-500">Loading Editor…</div>}
                                    />
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-gray-500">
                            <div className="w-20 h-20 rounded-full bg-dark-800 flex items-center justify-center mb-4 border border-white/5">
                                <Github size={32} />
                            </div>
                            <h2 className="text-xl font-medium text-white mb-2">Workspace Viewer</h2>
                            <p className="text-sm">Select a file from the repository tree to view its contents.</p>
                        </div>
                    )}
                </AnimatedCard>
            </div>
        </div>
    );
};
