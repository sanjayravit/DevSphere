import React, { useState, useRef, useEffect } from 'react';
import { Search, Bell, Command, ChevronDown, User, Settings, LogOut, Sparkles, GitCommit, Code2, Zap, MessageSquare, Menu } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import socket from '../../services/socket';

export const Topbar = ({ onMenuClick }) => {
    const { user, token, logout } = useAuth();
    const { activeWorkspace } = useWorkspace();
    const navigate = useNavigate();
    const [showNotifications, setShowNotifications] = useState(false);
    const notifRef = useRef(null);

    const [notifications, setNotifications] = useState([]);
    const [notificationError, setNotificationError] = useState('');
    const [notificationLoading, setNotificationLoading] = useState(false);
    const [notificationLive, setNotificationLive] = useState(false);
    const [notificationVersion, setNotificationVersion] = useState(0);
    useEffect(() => {
        setNotifications([]); setNotificationError('');
        if (!user?.id || !token) return undefined;
        let timer;
        const connected = () => { setNotificationLive(true); setNotificationVersion(value => value + 1); };
        const disconnected = () => setNotificationLive(false);
        const changed = event => {
            if (!event?.runId || event.status === 'running' || !['decision', 'approval', 'github-pr', 'orchestrator', 'deployment'].includes(event.step)) return;
            clearTimeout(timer); timer = setTimeout(() => setNotificationVersion(value => value + 1), 200);
        };
        socket.on('connect', connected); socket.on('disconnect', disconnected); socket.on('connect_error', disconnected); socket.on('devsphere:update', changed);
        if (socket.connected) connected(); else socket.connect();
        return () => { clearTimeout(timer); socket.off('connect', connected); socket.off('disconnect', disconnected); socket.off('connect_error', disconnected); socket.off('devsphere:update', changed); };
    }, [user?.id, token]);
    const unreadCount = notifications.filter(item => item.unread).length;
    useEffect(() => {
        if (!user?.id || !token) return undefined;
        let active = true; const controller = new AbortController();
        setNotificationLoading(true);
        api.get('/v2/runs?limit=5', { signal: controller.signal }).then(response => {
            if (!active) return;
            if (!Array.isArray(response.data.runs)) throw new Error('Invalid notification data.');
            setNotificationError('');
            setNotifications(response.data.runs.map(run => ({ id: run.id, icon: run.status === 'pending_approval' ? Sparkles : GitCommit, title: `${run.status.replaceAll('_', ' ')}: ${run.issue || run.input}`, time: new Date(run.updatedAt || run.createdAt).toLocaleString(), unread: run.status === 'pending_approval' })));
        }).catch(() => { if (active) setNotificationError('Run notifications are unavailable. Sign in again if the session expired; previous results may be outdated.'); }).finally(() => { if (active) setNotificationLoading(false); });
        return () => { active = false; controller.abort(); };
    }, [showNotifications, user?.id, token, notificationVersion]);

    // Close dropdown on click outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (notifRef.current && !notifRef.current.contains(e.target)) {
                setShowNotifications(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <header className="h-16 border-b border-white/5 bg-dark-900/40 backdrop-blur-xl flex items-center justify-between px-4 md:px-8 sticky top-0 z-30">
            {/* Mobile Menu Toggle */}
            <button
                onClick={onMenuClick}
                className="lg:hidden p-2 -ml-2 text-gray-400 hover:text-white transition-colors"
            >
                <Menu size={24} />
            </button>

            {/* Breadcrumbs & Active Info */}
            <div className="flex items-center gap-4 text-sm hidden sm:flex">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/5 text-gray-400">
                    <span className="text-gray-500">Workspace</span>
                    <span className="text-white font-medium">{activeWorkspace?.name || '...'}</span>
                </div>
            </div>

            {/* Search Bar */}
            <div className="flex-1 max-w-xl px-4 md:px-8 hidden xs:block">
                <div className="relative group">
                    <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none text-gray-500 group-focus-within:text-primary-400 transition-colors">
                        <Search size={18} />
                    </div>
                    <input
                        type="text"
                        placeholder="Search... (⌘ K)"
                        className="w-full bg-dark-800/50 border border-white/5 rounded-xl pl-11 pr-12 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500/50 transition-all"
                    />
                    <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none hidden md:flex">
                        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-white/10 bg-white/5 text-[10px] text-gray-500 font-mono">
                            <Command size={10} />
                            <span>K</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-4">
                {/* Notification Bell */}
                <div ref={notifRef} className="relative">
                    <button
                        aria-label="Run notifications"
                        onClick={() => setShowNotifications(prev => !prev)}
                        className="relative p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/5 hover:scale-110 hover:shadow-[0_0_15px_rgba(99,102,241,0.4)] transition-all duration-300"
                    >
                        <Bell size={20} />
                        {unreadCount > 0 && (
                            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center bg-primary-500 rounded-full text-[10px] font-bold text-white border-2 border-dark-900 animate-pulse shadow-neon-blue">
                                {unreadCount}
                            </span>
                        )}
                    </button>

                    {/* Notification Dropdown */}
                    <div
                        className={`absolute right-0 top-14 w-80 bg-dark-800/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden transition-all duration-300 origin-top-right ${showNotifications
                            ? 'opacity-100 scale-100 translate-y-0'
                            : 'opacity-0 scale-95 -translate-y-2 pointer-events-none'
                            }`}
                    >
                        <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
                            <span className="text-sm font-semibold text-white">Notifications <span className="text-[10px] font-normal text-gray-500">{notificationLive ? 'Live' : 'Live updates offline'}</span></span>
                            {unreadCount > 0 && (
                                <span className="text-[10px] font-bold uppercase tracking-wider text-primary-400 bg-primary-500/10 px-2 py-0.5 rounded-full">
                                    {unreadCount} new
                                </span>
                            )}
                        </div>
                        <div className="max-h-80 overflow-y-auto custom-scrollbar">
                            {notificationError && <p role="alert" className="p-4 text-xs text-red-300">{notificationError}</p>}
                            {!notifications.length && !notificationError && <p className="p-4 text-xs text-gray-400">{notificationLoading ? 'Loading run notifications…' : 'No run notifications yet.'}</p>}
                            {notifications.map((n) => (
                                <div
                                    key={n.id}
                                    onClick={() => { setShowNotifications(false); navigate(`/v2?runId=${n.id}`); }}
                                    className={`flex items-start gap-3 px-4 py-3 hover:bg-white/5 transition-colors cursor-pointer border-b border-white/5 last:border-0 ${n.unread ? 'bg-primary-500/5' : ''
                                        }`}
                                >
                                    <div className={`mt-0.5 w-8 h-8 shrink-0 rounded-lg flex items-center justify-center border border-white/10 ${n.unread ? 'bg-primary-500/10 text-primary-400' : 'bg-dark-900/60 text-gray-500'
                                        }`}>
                                        <n.icon size={14} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className={`text-sm leading-snug truncate ${n.unread ? 'text-white font-medium' : 'text-gray-400'}`}>
                                            {n.title}
                                        </p>
                                        <p className="text-[10px] text-gray-500 mt-0.5">{n.time}</p>
                                    </div>
                                    {n.unread && (
                                        <div className="w-2 h-2 mt-2 rounded-full bg-primary-500 shrink-0 shadow-neon-blue" />
                                    )}
                                </div>
                            ))}
                        </div>
                        <div className="px-4 py-2.5 border-t border-white/5 text-center">
                            <button onClick={() => { setShowNotifications(false); navigate("/v2"); }} className="text-xs text-primary-400 hover:text-primary-300 font-medium transition-colors">
                                View all notifications
                            </button>
                        </div>
                    </div>
                </div>

                <div className="h-8 w-px bg-white/5 mx-1"></div>

                {/* Profile Section */}
                <div
                    onClick={() => navigate('/profile')}
                    className="flex items-center gap-3 pl-2 cursor-pointer group"
                >
                    <div className="flex flex-col items-end hidden md:flex">
                        <span className="text-sm font-medium text-white truncate max-w-[120px] group-hover:text-primary-300 transition-colors">{user?.name || 'Developer'}</span>
                        <div className="flex items-center gap-1 text-[10px] text-primary-400 font-semibold uppercase tracking-wider">
                            <Sparkles size={10} />
                            Developer
                        </div>
                    </div>
                    <div className="relative w-9 h-9 flex items-center justify-center">
                        {/* HUD Cyberpunk Rings */}
                        <div className="absolute inset-[-6px] rounded-full border border-primary-500/30 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
                        <div className="absolute inset-[-6px] rounded-full border-2 border-transparent border-t-primary-400 border-b-primary-400 opacity-0 group-hover:opacity-100 group-hover:animate-[spin_3s_linear_infinite] shadow-[0_0_10px_rgba(99,102,241,0.5)] transition-all duration-300 pointer-events-none"></div>
                        <div className="absolute inset-[-2px] rounded-full border border-dashed border-primary-300 opacity-0 group-hover:opacity-100 group-hover:animate-[spin_4s_linear_infinite_reverse] transition-all duration-300 pointer-events-none"></div>

                        {/* Avatar */}
                        <div className="relative w-full h-full rounded-full bg-gradient-to-tr from-primary-500 to-accent-purple flex items-center justify-center border border-white/10 text-white font-bold shadow-neon-blue transition-transform duration-300 group-hover:scale-95">
                            {user?.name ? user.name.charAt(0) : 'D'}
                        </div>
                    </div>
                </div>
            </div>
        </header>
    );
};
