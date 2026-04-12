import React, { useState, useEffect } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { io } from 'socket.io-client';
import { Activity, CheckCircle, ServerCrash, Cpu, Github, BrainCircuit } from 'lucide-react';

const timeAgo = (date) => {
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);
    if (seconds < 60) return `${Math.max(seconds, 1)}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
};

export const SelfHealingPage = () => {
    const { activeWorkspace } = useWorkspace();
    const [events, setEvents] = useState([]);

    useEffect(() => {
        // Fetch history
        const fetchHistory = async () => {
            if (!activeWorkspace) return;
            try {
                // Determine API URL based on env or fallback
                const apiUrl = process.env.REACT_APP_API_URL || import.meta.env?.VITE_API_URL || 'http://localhost:5000';
                const res = await fetch(`${apiUrl}/api/webhook/history?projectId=${activeWorkspace.id}`);
                const data = await res.json();
                if (data.events) {
                    setEvents(data.events);
                }
            } catch (error) {
                console.error('Failed to fetch self-healing history', error);
            }
        };
        fetchHistory();

        // Connect socket
        const socketUrl = process.env.REACT_APP_SOCKET_URL || import.meta.env?.VITE_SOCKET_URL || 'http://localhost:5000';
        const socket = io(socketUrl);

        socket.on('error_detected', (data) => {
            setEvents(prev => [{ ...data, type: 'ERROR_DETECTED', id: Date.now().toString(), timestamp: new Date().toISOString() }, ...prev]);
        });

        socket.on('deployment_failed', (data) => {
            setEvents(prev => [{ ...data, type: 'VERCEL_ERROR_DETECTED', id: Date.now().toString(), timestamp: new Date().toISOString() }, ...prev]);
        });

        socket.on('fix_generated', (data) => {
            setEvents(prev => [{ ...data, type: 'FIX_GENERATED', id: Date.now().toString(), timestamp: new Date().toISOString() }, ...prev]);
        });

        socket.on('pr_created', (data) => {
            setEvents(prev => [{ ...data, type: 'PR_CREATED', id: Date.now().toString(), timestamp: new Date().toISOString() }, ...prev]);
        });

        return () => {
            socket.disconnect();
        };
    }, [activeWorkspace]);

    return (
        <div className="w-full h-full flex flex-col items-center bg-dark-900 border-l border-white/5 overflow-y-auto custom-scrollbar">
            <div className="max-w-4xl w-full mx-auto px-8 py-12">
                <header className="mb-10 flex flex-col items-start">
                    <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full bg-primary-500/10 border border-primary-500/20 text-primary-400 font-medium text-sm mb-4">
                        <span className="relative flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-primary-500"></span>
                        </span>
                        Autonomous Monitoring Active
                    </div>
                    <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400 tracking-tight">
                        Self-Healing Dashboard
                    </h1>
                    <p className="text-gray-400 mt-3 text-lg">
                        Live stream of AI agents automatically detecting, analyzing, and fixing issues in your projects.
                    </p>
                </header>

                <div className="space-y-6">
                    {events.length === 0 ? (
                        <div className="p-12 border border-dashed border-white/10 rounded-3xl flex flex-col items-center justify-center text-center bg-dark-800/30">
                            <Cpu className="text-white/20 mb-6" size={56} />
                            <h3 className="text-xl font-bold text-white mb-2">Systems Active</h3>
                            <p className="text-gray-400 max-w-sm">
                                Watching incoming webhooks and Vercel logs. When an error crashes your deployment, the AI will auto-fix it here.
                            </p>
                        </div>
                    ) : (
                        <div className="relative">
                            {/* Vertical timeline line */}
                            <div className="absolute left-8 top-8 bottom-8 w-px bg-white/5 z-0" />

                            <div className="space-y-8 relative z-10">
                                {events.map((event, index) => (
                                    <EventCard key={event.id || index} event={event} />
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const EventCard = ({ event }) => {
    let icon = <Activity size={20} />;
    let color = "text-gray-400";
    let title = "System Event";
    let bg = "bg-dark-800";
    let borderColor = "border-white/10";

    if (event.type === 'ERROR_DETECTED' || event.type === 'VERCEL_ERROR_DETECTED') {
        icon = <ServerCrash size={20} />;
        color = "text-red-400";
        title = `Error Detected in ${event.repo || 'Project'}`;
        bg = "bg-red-500/5";
        borderColor = "border-red-500/20";
    } else if (event.type === 'FIX_GENERATED') {
        icon = <BrainCircuit size={20} />;
        color = "text-primary-400";
        title = `AI Fix Generated for ${event.repo || 'Project'}`;
        bg = "bg-primary-500/5";
        borderColor = "border-primary-500/20";
    } else if (event.type === 'PR_CREATED') {
        icon = <CheckCircle size={20} />;
        color = "text-emerald-400";
        title = `Pull Request Created for ${event.repo || 'Project'}`;
        bg = "bg-emerald-500/5";
        borderColor = "border-emerald-500/20";
    }

    return (
        <div className={`p-6 rounded-3xl border transition-all ${bg} ${borderColor} backdrop-blur-md hover:bg-white/5`}>
            <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-2xl bg-dark-900 border ${borderColor} flex items-center justify-center ${color} shadow-lg`}>
                        {icon}
                    </div>
                    <div>
                        <h3 className="font-semibold text-lg text-white/90">{title}</h3>
                        {event.source === 'vercel' && (
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-white/10 text-white/70 mt-1 inline-block">
                                VERCEL DEPLOYMENT
                            </span>
                        )}
                    </div>
                </div>
                {event.timestamp && (
                    <span className="text-sm text-gray-500 font-mono tracking-wider bg-dark-900 px-3 py-1 rounded-lg border border-white/5">
                        {timeAgo(event.timestamp)}
                    </span>
                )}
            </div>

            <div className="pl-16 space-y-4">
                {event.error && (
                    <div>
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Stack Trace</p>
                        <div className="p-4 rounded-xl bg-dark-900 border border-white/5 font-mono text-sm text-red-400/90 overflow-x-auto whitespace-pre-wrap">
                            {event.error}
                        </div>
                    </div>
                )}
                {event.explanation && (
                    <div>
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">AI Diagnosis</p>
                        <div className="text-gray-300 leading-relaxed text-sm bg-dark-900/50 p-4 rounded-xl border border-white/5">
                            {event.explanation}
                        </div>
                    </div>
                )}
                {event.prUrl && (
                    <a href={event.prUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-500/20 to-emerald-500/5 hover:from-emerald-500/30 hover:to-emerald-500/10 text-emerald-400 rounded-xl text-sm font-bold transition-all border border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.1)]">
                        <Github size={16} />
                        Merge Automated Fix
                    </a>
                )}
            </div>
        </div>
    );
};
