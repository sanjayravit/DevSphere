import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
    TerminalSquare,
    LayoutDashboard,
    MessageSquare,
    Github,
    Code2,
    BrainCircuit,
    LogOut
} from 'lucide-react';
import { cn } from '../ui/Button';

const NavItem = ({ to, icon: Icon, label }) => {
    return (
        <NavLink
            to={to}
            className={({ isActive }) =>
                cn(
                    "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 font-medium",
                    isActive
                        ? "bg-primary-500/10 text-primary-400 shadow-[inset_2px_0_0_#6366f1]"
                        : "text-gray-400 hover:text-white hover:bg-white/5"
                )
            }
        >
            <Icon size={20} />
            <span>{label}</span>
        </NavLink>
    );
};

export const Sidebar = () => {
    const { logout, user } = useAuth();
    const navigate = useNavigate();

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    return (
        <div className="w-64 h-screen fixed left-0 top-0 border-r border-white/5 bg-dark-900/50 backdrop-blur-xl flex flex-col pt-8 pb-6 px-4 z-40">
            <div className="flex items-center gap-3 px-4 mb-10">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-primary-500 to-accent-purple flex items-center justify-center shadow-neon-purple">
                    <TerminalSquare size={18} className="text-white" />
                </div>
                <h1 className="text-xl font-bold tracking-tight text-white">DevSphere</h1>
            </div>

            <nav className="flex-1 space-y-2">
                <NavItem to="/dashboard" icon={LayoutDashboard} label="Dashboard" />
                <NavItem to="/feed" icon={MessageSquare} label="Social Feed" />
                <NavItem to="/editor" icon={Code2} label="Code Editor" />
                <NavItem to="/ai-tools" icon={BrainCircuit} label="AI Tools" />
                <NavItem to="/profile" icon={Github} label="My Profile" />
            </nav>

            <div className="mt-auto border-t border-white/5 pt-6">
                {user && (
                    <div className="flex items-center gap-3 px-4 mb-6">
                        <div className="w-10 h-10 rounded-full bg-dark-700 flex items-center justify-center border border-white/10 uppercase tracking-wider font-semibold text-primary-400">
                            {user.name ? user.name.slice(0, 2) : 'US'}
                        </div>
                        <div className="overflow-hidden">
                            <p className="text-sm font-medium text-white truncate">{user.name || 'User'}</p>
                            <p className="text-xs text-gray-400 truncate">{user.email || 'user@devsphere.io'}</p>
                        </div>
                    </div>
                )}
                <button
                    onClick={handleLogout}
                    className="flex items-center gap-3 px-4 py-3 w-full rounded-xl text-gray-400 hover:text-red-400 hover:bg-red-400/10 transition-colors font-medium text-left"
                >
                    <LogOut size={20} />
                    <span>Sign Out</span>
                </button>
            </div>
        </div>
    );
};
