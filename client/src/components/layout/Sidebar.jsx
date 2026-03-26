import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import {
    TerminalSquare,
    LayoutDashboard,
    MessageSquare,
    Github,
    BrainCircuit,
    LogOut,
    ChevronDown,
    Plus,
    FolderDot,
    Settings,
    PackageOpen,
    Layers,
    Type
} from 'lucide-react';
import { cn, Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';

const NavItem = ({ to, icon: Icon, label }) => {
    return (
        <NavLink to={to}>
            {({ isActive }) => (
                <div className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-xl transition duration-500 font-medium relative overflow-hidden group",
                    isActive
                        ? "bg-primary-500/10 text-primary-400 shadow-[inset_0_0_20px_rgba(99,102,241,0.15)] before:absolute before:left-0 before:top-1/4 before:bottom-1/4 before:w-1 before:bg-primary-500 before:rounded-r-full before:shadow-[0_0_12px_#6366f1]"
                        : "text-gray-400 hover:text-white hover:bg-white/5"
                )}>
                    <Icon size={20} className={cn("relative z-10 transition duration-300", isActive ? "scale-110 drop-shadow-[0_0_8px_rgba(99,102,241,0.6)]" : "group-hover:scale-110")} />
                    <span className="relative z-10 tracking-wide truncate">{label}</span>
                    <div className="absolute inset-0 bg-gradient-to-r from-primary-500/0 to-primary-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                </div>
            )}
        </NavLink>
    );
};

export const Sidebar = () => {
    const { logout, user } = useAuth();
    const { workspaces, activeWorkspace, projects, changeWorkspace, createWorkspace, createProject } = useWorkspace();
    const navigate = useNavigate();

    const [isWorkspaceDropdownOpen, setWorkspaceDropdownOpen] = useState(false);
    const [isCreateWorkspaceModalOpen, setCreateWorkspaceModalOpen] = useState(false);
    const [isCreateProjectModalOpen, setCreateProjectModalOpen] = useState(false);

    const [newWorkspaceName, setNewWorkspaceName] = useState("");
    const [newProjectName, setNewProjectName] = useState("");
    const [newProjectLanguage, setNewProjectLanguage] = useState("javascript");

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const handleCreateProject = async (e) => {
        e.preventDefault();
        if (newProjectName.trim()) {
            const project = await createProject(newProjectName, newProjectLanguage);
            setCreateProjectModalOpen(false);
            setNewProjectName("");
            if (project) navigate(`/editor/${project.id}`);
        }
    };

    const handleCreateWorkspace = async (e) => {
        e.preventDefault();
        if (newWorkspaceName.trim()) {
            await createWorkspace(newWorkspaceName);
            setCreateWorkspaceModalOpen(false);
            setNewWorkspaceName("");
        }
    };

    return (
        <div className="w-64 h-screen fixed left-0 top-0 border-r border-white/5 bg-dark-900/50 backdrop-blur-xl flex flex-col pt-6 pb-6 px-4 z-40 custom-scrollbar overflow-y-auto">

            {/* Workspace Selector */}
            <div className="mb-6 relative shrink-0">
                <button
                    onClick={() => setWorkspaceDropdownOpen(!isWorkspaceDropdownOpen)}
                    className="w-full flex items-center justify-between p-3 rounded-xl bg-dark-800/80 border border-white/10 hover:border-primary-500/50 transition-colors"
                >
                    <div className="flex items-center gap-3 overflow-hidden">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-primary-500 to-accent-purple flex items-center justify-center shrink-0">
                            <TerminalSquare size={16} className="text-white" />
                        </div>
                        <div className="text-left font-medium text-white truncate">
                            <div className="text-[10px] text-gray-500 tracking-widest uppercase">Workspace</div>
                            <div className="truncate text-sm">{activeWorkspace?.name || 'Loading...'}</div>
                        </div>
                    </div>
                    <ChevronDown size={14} className="text-gray-400 shrink-0" />
                </button>

                {isWorkspaceDropdownOpen && (
                    <div className="absolute top-full left-0 w-full mt-2 bg-dark-800 border border-white/10 rounded-xl shadow-xl overflow-hidden z-50">
                        {workspaces.map(w => (
                            <button
                                key={w.id}
                                onClick={() => { changeWorkspace(w); setWorkspaceDropdownOpen(false); }}
                                className={`w-full text-left p-3 text-sm hover:bg-white/5 transition-colors ${w.id === activeWorkspace?.id ? 'text-primary-400 bg-primary-500/5' : 'text-gray-300'}`}
                            >
                                {w.name}
                            </button>
                        ))}
                        <button
                            onClick={() => { setCreateWorkspaceModalOpen(true); setWorkspaceDropdownOpen(false); }}
                            className="w-full text-left p-3 text-sm text-gray-400 hover:text-white hover:bg-white/5 border-t border-white/5 flex items-center gap-2"
                        >
                            <Plus size={14} /> New Workspace
                        </button>
                    </div>
                )}
            </div>

            {/* Global Navigation */}
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3 pl-2 shrink-0">Navigation</div>
            <nav className="space-y-1 mb-8 shrink-0">
                <NavItem to="/dashboard" icon={LayoutDashboard} label="Dashboard" />
                <NavItem to="/marketplace" icon={PackageOpen} label="Marketplace" />
                <NavItem to="/feed" icon={MessageSquare} label="Social Feed" />
                <NavItem to="/ai-tools" icon={BrainCircuit} label="AI Tools" />
                <NavItem to="/profile" icon={Github} label="My Profile" />
            </nav>

            {/* Workspace Projects List */}
            <div className="flex items-center justify-between mb-3 pl-2 pr-1 shrink-0">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Projects</div>
                <button onClick={() => setCreateProjectModalOpen(true)} className="text-gray-400 hover:text-primary-400 transition-colors p-1" title="New Project">
                    <Plus size={14} />
                </button>
            </div>
            <nav className="flex-1 space-y-1 overflow-y-auto custom-scrollbar mb-6 min-h-[100px]">
                {projects.map(p => (
                    <NavItem key={p.id} to={`/editor/${p.id}`} icon={FolderDot} label={p.name} />
                ))}
                {projects.length === 0 && (
                    <div className="text-sm text-gray-600 px-4 py-2 italic text-center mt-4">No projects yet</div>
                )}
            </nav>

            {/* Session Settings */}
            <div className="mt-auto border-t border-white/5 pt-6 shrink-0">
                {user && (
                    <div className="flex items-center gap-3 px-4 mb-4">
                        <div className="w-10 h-10 rounded-full bg-dark-700 flex items-center justify-center border border-white/10 uppercase tracking-wider font-semibold text-primary-400 shrink-0">
                            {user.name ? user.name.slice(0, 2) : 'US'}
                        </div>
                        <div className="overflow-hidden">
                            <p className="text-sm font-medium text-white truncate">{user.name || 'Developer'}</p>
                            <p className="text-xs text-gray-400 truncate">{user.email || 'user@devsphere.io'}</p>
                        </div>
                    </div>
                )}
                <div className="flex gap-2">
                    <button className="flex-1 flex justify-center items-center gap-2 p-2.5 rounded-xl text-gray-400 hover:text-white hover:bg-white/5 transition-colors bg-dark-800 border border-white/5">
                        <Settings size={18} />
                    </button>
                    <button
                        onClick={handleLogout}
                        className="flex-1 flex justify-center items-center gap-2 p-2.5 rounded-xl text-gray-400 hover:text-red-400 hover:bg-red-400/10 transition-colors bg-dark-800 border border-white/5"
                    >
                        <LogOut size={18} />
                    </button>
                </div>
            </div>

            {/* Modals */}
            <Modal
                isOpen={isCreateWorkspaceModalOpen}
                onClose={() => setCreateWorkspaceModalOpen(false)}
                title="Create New Workspace"
            >
                <form onSubmit={handleCreateWorkspace} className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-widest pl-1">Workspace Name</label>
                        <Input
                            icon={Layers}
                            placeholder="e.g. Acme Studio"
                            value={newWorkspaceName}
                            onChange={(e) => setNewWorkspaceName(e.target.value)}
                            autoFocus
                        />
                    </div>
                    <Button type="submit" className="w-full" disabled={!newWorkspaceName.trim()}>
                        Create Workspace
                    </Button>
                </form>
            </Modal>

            <Modal
                isOpen={isCreateProjectModalOpen}
                onClose={() => setCreateProjectModalOpen(false)}
                title="Launch New Project"
            >
                <form onSubmit={handleCreateProject} className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-widest pl-1">Project Name</label>
                        <Input
                            icon={Type}
                            placeholder="e.g. AI Dashboard"
                            value={newProjectName}
                            onChange={(e) => setNewProjectName(e.target.value)}
                            autoFocus
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-widest pl-1">Primary Language</label>
                        <select
                            className="w-full h-12 rounded-xl border border-white/10 bg-dark-800/50 px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 transition"
                            value={newProjectLanguage}
                            onChange={(e) => setNewProjectLanguage(e.target.value)}
                        >
                            <option value="javascript">JavaScript</option>
                            <option value="python">Python</option>
                            <option value="java">Java</option>
                            <option value="cpp">C++</option>
                        </select>
                    </div>
                    <Button type="submit" className="w-full" disabled={!newProjectName.trim()}>
                        Generate Project
                    </Button>
                </form>
            </Modal>
        </div>
    );
};

