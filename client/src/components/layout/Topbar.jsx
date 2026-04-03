import React, { useState, useRef, useEffect } from 'react';
import { Search, Bell, Command, ChevronDown, User, Settings, LogOut, Sparkles, GitCommit, Code2, Zap, MessageSquare, Menu } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useWorkspace } from '../../context/WorkspaceContext';

const MOCK_NOTIFICATIONS = [
    { id: 1, type: 'ai', icon: Sparkles, title: 'AI optimized your auth module', time: '2 min ago', unread: true },
    { id: 2, type: 'collab', icon: MessageSquare, title: 'New comment on Dashboard.jsx', time: '15 min ago', unread: true },
    { id: 3, type: 'git', icon: GitCommit, title: 'Branch main updated with 3 commits', time: '1 hr ago', unread: false },
    { id: 4, type: 'system', icon: Zap, title: 'Build succeeded — 0 warnings', time: '3 hr ago', unread: false },
];

export const Topbar = ({ onMenuClick }) => {
    const { user, logout } = useAuth();
    const { activeWorkspace } = useWorkspace();
    const [showNotifications, setShowNotifications] = useState(false);
    const notifRef = useRef(null);

    const unreadCount = MOCK_NOTIFICATIONS.filter(n => n.unread).length;

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
                            <span className="text-sm font-semibold text-white">Notifications</span>
                            {unreadCount > 0 && (
                                <span className="text-[10px] font-bold uppercase tracking-wider text-primary-400 bg-primary-500/10 px-2 py-0.5 rounded-full">
                                    {unreadCount} new
                                </span>
                            )}
                        </div>
                        <div className="max-h-80 overflow-y-auto custom-scrollbar">
                            {MOCK_NOTIFICATIONS.map((n) => (
                                <div
                                    key={n.id}
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
                            <button className="text-xs text-primary-400 hover:text-primary-300 font-medium transition-colors">
                                View all notifications
                            </button>
                        </div>
                    </div>
                </div>

                <div className="h-8 w-px bg-white/5 mx-1"></div>

                {/* Profile Section */}
                <div className="flex items-center gap-3 pl-2">
                    <div className="flex flex-col items-end hidden md:flex">
                        <span className="text-sm font-medium text-white truncate max-w-[120px]">{user?.name || 'Developer'}</span>
                        <div className="flex items-center gap-1 text-[10px] text-primary-400 font-semibold uppercase tracking-wider">
                            <Sparkles size={10} />
                            Pro Account
                        </div>
                    </div>
                    <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-primary-500 to-accent-purple flex items-center justify-center border border-white/10 text-white font-bold shadow-neon-blue cursor-pointer hover:scale-105 transition-transform">
                        {user?.name ? user.name.charAt(0) : 'D'}
                    </div>
                </div>
            </div>
        </header>
    );
};
