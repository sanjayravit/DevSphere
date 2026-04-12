import React, { useState, useEffect, useRef } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { io } from 'socket.io-client';
import api from '../services/api';
import {
    Activity, CheckCircle, ServerCrash, BrainCircuit,
    Github, Layers, FolderDot, ChevronDown, Cpu,
    ShieldCheck, Zap, Eye, EyeOff
} from 'lucide-react';

const timeAgo = (date) => {
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);
    if (seconds < 60) return `${Math.max(seconds, 1)}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
};

const SOCKET_URL = import.meta?.env?.VITE_SOCKET_URL || 'http://localhost:5000';
const API_URL = import.meta?.env?.VITE_API_URL || 'http://localhost:5000';

const StatusBadge = ({ monitoring }) => (
    <div className={`inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full border text-sm font-medium transition-all duration-500 ${monitoring
        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
        : 'bg-dark-800 border-white/10 text-gray-500'
        }`}>
        {monitoring ? (
            <>
                <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                </span>
                Monitoring Active
            </>
        ) : (
            <>
                <span className="h-2.5 w-2.5 rounded-full bg-gray-600" />
                Idle
            </>
        )}
    </div>
);

export const SelfHealingPage = () => {
    const { workspaces, activeWorkspace, projects } = useWorkspace();

    const [selectedScope, setSelectedScope] = useState('workspace');   // 'workspace' | 'project'
    const [selectedWorkspace, setSelectedWorkspace] = useState(null);
    const [selectedProject, setSelectedProject] = useState(null);
    const [workspaceDropOpen, setWorkspaceDropOpen] = useState(false);
    const [projectDropOpen, setProjectDropOpen] = useState(false);

    const [monitoring, setMonitoring] = useState(false);
    const [loading, setLoading] = useState(false);
    const [events, setEvents] = useState([]);
    const socketRef = useRef(null);

    // Default selections to active context
    useEffect(() => {
        if (activeWorkspace && !selectedWorkspace) {
            setSelectedWorkspace(activeWorkspace);
        }
    }, [activeWorkspace]);

    const targetId = selectedScope === 'project'
        ? selectedProject?.id
        : selectedWorkspace?.id;

    const targetLabel = selectedScope === 'project'
        ? selectedProject?.name
        : selectedWorkspace?.name;

    const fetchHistory = async () => {
        if (!targetId) return;
        try {
            const res = await api.get(`/webhook/history?projectId=${targetId}`);
            if (res.data?.events) setEvents(res.data.events);
        } catch (err) {
            console.error('History fetch failed', err);
        }
    };

    const handleEnableMonitoring = async () => {
        if (!targetId || monitoring) return;
        setLoading(true);
        await fetchHistory();

        socketRef.current = io(SOCKET_URL);

        socketRef.current.on('error_detected', (data) => {
            setEvents(prev => [{ ...data, type: 'ERROR_DETECTED', id: `${Date.now()}`, timestamp: new Date().toISOString() }, ...prev]);
        });
        socketRef.current.on('deployment_failed', (data) => {
            setEvents(prev => [{ ...data, type: 'VERCEL_ERROR_DETECTED', id: `${Date.now()}`, timestamp: new Date().toISOString() }, ...prev]);
        });
        socketRef.current.on('fix_generated', (data) => {
            setEvents(prev => [{ ...data, type: 'FIX_GENERATED', id: `${Date.now()}`, timestamp: new Date().toISOString() }, ...prev]);
        });
        socketRef.current.on('pr_created', (data) => {
            setEvents(prev => [{ ...data, type: 'PR_CREATED', id: `${Date.now()}`, timestamp: new Date().toISOString() }, ...prev]);
        });

        setLoading(false);
        setMonitoring(true);
    };

    const handleStopMonitoring = () => {
        if (socketRef.current) {
            socketRef.current.disconnect();
            socketRef.current = null;
        }
        setMonitoring(false);
    };

    useEffect(() => () => socketRef.current?.disconnect(), []);

    return (
        <div className="w-full min-h-full bg-dark-900 overflow-y-auto custom-scrollbar">
            <div className="max-w-4xl mx-auto px-6 py-12 space-y-10">

                {/* ─── Header ─────────────────────────────────── */}
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary-500 to-accent-purple flex items-center justify-center shadow-[0_0_24px_rgba(99,102,241,0.4)]">
                                <ShieldCheck size={20} className="text-white" />
                            </div>
                            <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white via-gray-200 to-gray-500">
                                Self-Healing Agent
                            </h1>
                        </div>
                        <p className="text-gray-400 text-sm leading-relaxed max-w-lg">
                            Select a workspace or project to begin monitoring. The AI agent will autonomously detect errors, generate fixes, and open pull requests.
                        </p>
                    </div>
                    <StatusBadge monitoring={monitoring} />
                </div>

                {/* ─── Agent Config Card ───────────────────────── */}
                <div className="p-7 rounded-3xl border border-white/10 bg-dark-800/60 backdrop-blur-xl space-y-6 shadow-xl">
                    {/* Scope toggle */}
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Monitor Scope</label>
                        <div className="inline-flex rounded-xl border border-white/10 overflow-hidden bg-dark-900">
                            {['workspace', 'project'].map(scope => (
                                <button
                                    key={scope}
                                    disabled={monitoring}
                                    onClick={() => { setSelectedScope(scope); setProjectDropOpen(false); setWorkspaceDropOpen(false); }}
                                    className={`flex items-center gap-2 px-5 py-2.5 text-sm font-semibold transition-all duration-200 disabled:cursor-not-allowed ${selectedScope === scope
                                        ? 'bg-primary-500/20 text-primary-300 shadow-inner'
                                        : 'text-gray-500 hover:text-gray-300'
                                        }`}
                                >
                                    {scope === 'workspace' ? <Layers size={14} /> : <FolderDot size={14} />}
                                    {scope.charAt(0).toUpperCase() + scope.slice(1)}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Workspace selector */}
                    <div className="relative">
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Workspace</label>
                        <button
                            disabled={monitoring}
                            onClick={() => { setWorkspaceDropOpen(p => !p); setProjectDropOpen(false); }}
                            className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-dark-900 border border-white/10 hover:border-primary-500/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <div className="flex items-center gap-3">
                                <Layers size={16} className="text-primary-400" />
                                <span className="text-sm text-white font-medium">{selectedWorkspace?.name || 'Select Workspace…'}</span>
                            </div>
                            <ChevronDown size={14} className={`text-gray-400 transition-transform ${workspaceDropOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {workspaceDropOpen && (
                            <div className="absolute z-50 top-full left-0 w-full mt-2 bg-dark-800 border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
                                {workspaces.map(w => (
                                    <button key={w.id} onClick={() => { setSelectedWorkspace(w); setWorkspaceDropOpen(false); setSelectedProject(null); }}
                                        className={`w-full text-left px-4 py-3 text-sm flex items-center gap-3 hover:bg-white/5 transition-colors ${selectedWorkspace?.id === w.id ? 'text-primary-400 bg-primary-500/5' : 'text-gray-300'}`}>
                                        <Layers size={14} />
                                        {w.name}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Project selector (only when scope = project) */}
                    {selectedScope === 'project' && (
                        <div className="relative">
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Project</label>
                            <button
                                disabled={monitoring}
                                onClick={() => { setProjectDropOpen(p => !p); setWorkspaceDropOpen(false); }}
                                className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-dark-900 border border-white/10 hover:border-primary-500/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <div className="flex items-center gap-3">
                                    <FolderDot size={16} className="text-accent-purple" />
                                    <span className="text-sm text-white font-medium">{selectedProject?.name || 'Select Project…'}</span>
                                </div>
                                <ChevronDown size={14} className={`text-gray-400 transition-transform ${projectDropOpen ? 'rotate-180' : ''}`} />
                            </button>
                            {projectDropOpen && (
                                <div className="absolute z-50 top-full left-0 w-full mt-2 bg-dark-800 border border-white/10 rounded-2xl shadow-2xl overflow-hidden max-h-56 overflow-y-auto custom-scrollbar">
                                    {projects.length === 0 ? (
                                        <div className="px-4 py-3 text-sm text-gray-500 italic">No projects in this workspace</div>
                                    ) : projects.map(p => (
                                        <button key={p.id} onClick={() => { setSelectedProject(p); setProjectDropOpen(false); }}
                                            className={`w-full text-left px-4 py-3 text-sm flex items-center gap-3 hover:bg-white/5 transition-colors ${selectedProject?.id === p.id ? 'text-primary-400 bg-primary-500/5' : 'text-gray-300'}`}>
                                            <FolderDot size={14} />
                                            {p.name}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Monitoring button */}
                    <div className="pt-2 flex flex-col sm:flex-row gap-3">
                        <button
                            onClick={handleEnableMonitoring}
                            disabled={!targetId || monitoring || loading}
                            className={`flex-1 flex items-center justify-center gap-3 px-6 py-4 rounded-2xl font-bold text-base transition-all duration-300 shadow-lg ${monitoring
                                ? 'bg-dark-900 border border-white/10 text-gray-500 cursor-not-allowed'
                                : !targetId
                                    ? 'bg-dark-900 border border-white/5 text-gray-600 cursor-not-allowed'
                                    : 'bg-gradient-to-r from-primary-500 to-accent-purple hover:from-primary-400 hover:to-accent-purple/80 text-white shadow-[0_0_32px_rgba(99,102,241,0.4)] hover:shadow-[0_0_48px_rgba(99,102,241,0.6)] hover:scale-[1.02] active:scale-95'
                                }`}
                        >
                            {loading ? (
                                <>
                                    <span className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                    Initializing Agent…
                                </>
                            ) : monitoring ? (
                                <>
                                    <Eye size={18} /> Monitoring {targetLabel}…
                                </>
                            ) : (
                                <>
                                    <Zap size={18} />
                                    Enable Monitoring {targetLabel ? `on "${targetLabel}"` : ''}
                                </>
                            )}
                        </button>
                        {monitoring && (
                            <button onClick={handleStopMonitoring}
                                className="flex items-center justify-center gap-2 px-5 py-4 rounded-2xl font-semibold text-sm text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 transition-all duration-200 hover:scale-[1.01] active:scale-95">
                                <EyeOff size={16} /> Stop
                            </button>
                        )}
                    </div>
                </div>

                {/* ─── Live Event Feed ─────────────────────────── */}
                {monitoring && (
                    <div className="space-y-5">
                        <div className="flex items-center gap-3">
                            <h2 className="text-lg font-bold text-white">Live Agent Activity</h2>
                            <div className="flex-1 h-px bg-white/5" />
                            <span className="text-xs text-gray-500 font-mono">{events.length} events</span>
                        </div>

                        {events.length === 0 ? (
                            <div className="p-12 rounded-3xl border border-dashed border-white/8 bg-dark-800/20 flex flex-col items-center text-center gap-4">
                                <div className="w-16 h-16 rounded-2xl bg-dark-800 border border-white/10 flex items-center justify-center">
                                    <Cpu size={28} className="text-white/20" />
                                </div>
                                <div>
                                    <p className="text-white/60 font-semibold mb-1">Agent is listening…</p>
                                    <p className="text-gray-600 text-sm">Push code or trigger a Vercel deployment. Errors will appear here automatically.</p>
                                </div>
                            </div>
                        ) : (
                            <div className="relative">
                                <div className="absolute left-6 top-6 bottom-6 w-px bg-white/5" />
                                <div className="space-y-6 relative z-10">
                                    {events.map((event, i) => <EventCard key={event.id || i} event={event} />)}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

const EVENT_META = {
    ERROR_DETECTED: { icon: ServerCrash, color: 'text-red-400', bg: 'bg-red-500/5', border: 'border-red-500/20', titlePrefix: 'Error Detected' },
    VERCEL_ERROR_DETECTED: { icon: ServerCrash, color: 'text-orange-400', bg: 'bg-orange-500/5', border: 'border-orange-500/20', titlePrefix: 'Vercel Deployment Failed' },
    FIX_GENERATED: { icon: BrainCircuit, color: 'text-primary-400', bg: 'bg-primary-500/5', border: 'border-primary-500/20', titlePrefix: 'AI Fix Generated' },
    PR_CREATED: { icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/5', border: 'border-emerald-500/20', titlePrefix: 'Pull Request Created' },
};

const EventCard = ({ event }) => {
    const meta = EVENT_META[event.type] || { icon: Activity, color: 'text-gray-400', bg: 'bg-dark-800', border: 'border-white/10', titlePrefix: 'System Event' };
    const Icon = meta.icon;

    return (
        <div className={`p-5 rounded-2xl border ${meta.bg} ${meta.border} hover:bg-white/[0.03] transition-all duration-200`}>
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl bg-dark-900 border ${meta.border} flex items-center justify-center ${meta.color}`}>
                        <Icon size={18} />
                    </div>
                    <div>
                        <p className="font-semibold text-white/90 text-sm">{meta.titlePrefix} — {event.repo || 'Project'}</p>
                        {event.source === 'vercel' && (
                            <span className="text-[10px] font-bold tracking-widest uppercase text-orange-400/70">Vercel</span>
                        )}
                    </div>
                </div>
                {event.timestamp && (
                    <span className="text-xs text-gray-600 font-mono">{timeAgo(event.timestamp)}</span>
                )}
            </div>

            <div className="pl-13 space-y-3 pl-[52px]">
                {event.error && (
                    <div className="p-3 rounded-xl bg-dark-900/80 border border-white/5 font-mono text-xs text-red-400/90 overflow-x-auto whitespace-pre-wrap leading-relaxed">
                        {event.error}
                    </div>
                )}
                {event.explanation && (
                    <div className="text-gray-300 text-sm leading-relaxed bg-dark-900/50 p-3 rounded-xl border border-white/5">
                        <span className="text-xs font-bold uppercase tracking-widest text-gray-500 block mb-1">AI Diagnosis</span>
                        {event.explanation}
                    </div>
                )}
                {event.prUrl && (
                    <a href={event.prUrl} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 text-sm font-bold border border-emerald-500/25 transition-all hover:scale-[1.02]">
                        <Github size={14} /> View & Merge Pull Request
                    </a>
                )}
            </div>
        </div>
    );
};
