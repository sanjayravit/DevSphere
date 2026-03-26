import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Activity, GitMerge, Star, Users, FolderDot, Sparkles, Code2, HeartPulse, Bug } from 'lucide-react';
import { motion } from 'framer-motion';
import { useWorkspace } from '../context/WorkspaceContext';
import { useNavigate } from 'react-router-dom';
import { AnimatedCard } from '../components/ui/Card';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../services/api';

export const Dashboard = () => {
    const { user } = useAuth();
    const { activeWorkspace, projects, loading } = useWorkspace();
    const navigate = useNavigate();
    const [analytics, setAnalytics] = useState(null);

    useEffect(() => {
        const fetchAnalytics = async () => {
            try {
                const res = await api.get('/analytics');
                setAnalytics(res.data);
            } catch (err) {
                console.error("Dashboard Analytics Error", err);
            }
        };
        fetchAnalytics();
    }, [activeWorkspace]);

    const stats = analytics?.stats || {
        codeQuality: 0, totalProjects: 0, linesOfCode: 0,
        aiGenerations: 0, marketplaceInstalls: 0, bugFrequencyRating: 0
    };

    const STATS_DATA = [
        { label: 'Code Quality', value: `${stats.codeQuality}%`, icon: HeartPulse, color: 'text-green-400' },
        { label: 'Lines of Code', value: stats.linesOfCode, icon: Code2, color: 'text-primary-500' },
        { label: 'Bug Frequency', value: `${stats.bugFrequencyRating}%`, icon: Bug, color: 'text-red-400' },
        { label: 'AI Assistance', value: stats.aiGenerations, icon: Sparkles, color: 'text-accent-purple' },
    ];

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-display font-bold text-white mb-2">
                        Welcome back, <span className="text-gradient">{user?.name?.split(' ')[0] || 'Developer'}</span>
                    </h1>
                    <p className="text-gray-400">Here's what's happening in <span className="text-primary-400 font-semibold">{activeWorkspace?.name || 'your workspace'}</span> today.</p>
                </div>
                <div className="flex gap-2">
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {STATS_DATA.map((stat, i) => (
                    <AnimatedCard key={stat.label} delay={i * 0.1} className="flex flex-col group hover:border-primary-500/50 hover:shadow-neon-blue transition duration-500 bg-dark-800/60 backdrop-blur-xl relative overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-br from-primary-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                        <div className="flex items-center gap-3 mb-4 relative z-10">
                            <div className={`w-10 h-10 rounded-lg bg-dark-900/80 flex items-center justify-center border border-white/5 group-hover:scale-110 shadow-lg transition duration-500 ${stat.color}`}>
                                <stat.icon size={20} className="drop-shadow-lg" />
                            </div>
                            <span className="text-gray-400 font-medium tracking-wide">{stat.label}</span>
                        </div>
                        <span className="text-4xl font-display font-bold text-white tracking-tight relative z-10 drop-shadow-md">{stat.value}</span>
                    </AnimatedCard>
                ))}
            </div>

            {/* Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Developer Intelligence Graph */}
                <AnimatedCard delay={0.4} className="lg:col-span-2 flex flex-col min-h-[350px]">
                    <div className="flex items-center gap-2 mb-6">
                        <Activity className="text-primary-400" size={20} />
                        <h2 className="text-xl font-semibold text-white">Productivity & AI Velocity</h2>
                    </div>

                    <div className="flex-1 w-full relative min-h-[250px]">
                        {analytics?.activityData ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={analytics.activityData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="colorCommits" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="colorAi" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                                    <XAxis dataKey="name" stroke="#ffffff50" fontSize={12} tickLine={false} axisLine={false} />
                                    <YAxis stroke="#ffffff50" fontSize={12} tickLine={false} axisLine={false} />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                                        itemStyle={{ color: '#fff' }}
                                    />
                                    <Area type="monotone" dataKey="commits" stroke="#8b5cf6" strokeWidth={3} fillOpacity={1} fill="url(#colorCommits)" />
                                    <Area type="monotone" dataKey="aiCalls" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorAi)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="absolute inset-0 flex items-center justify-center text-gray-500 italic">Aggregating DB models...</div>
                        )}
                    </div>
                </AnimatedCard>

                {/* Quick Links / Top Projects */}
                <AnimatedCard delay={0.5}>
                    <div className="flex items-center gap-2 mb-6">
                        <FolderDot className="text-accent-purple" size={20} />
                        <h2 className="text-xl font-semibold text-white">Active Projects</h2>
                    </div>
                    <div className="space-y-3">
                        {projects.length === 0 && !loading && (
                            <div className="p-4 rounded-xl border border-dashed border-white/20 text-center flex flex-col items-center justify-center min-h-[150px]">
                                <FolderDot className="text-gray-500 mb-2" size={24} />
                                <p className="text-sm text-gray-400">No projects running yet.<br />Use the Sidebar to create one.</p>
                            </div>
                        )}
                        {projects.slice(0, 5).map((p, i) => (
                            <motion.div
                                onClick={() => navigate(`/editor/${p.id}`)}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.7 + (i * 0.1), duration: 0.4 }}
                                key={p.id}
                                className="group cursor-pointer p-4 rounded-xl border border-white/5 bg-dark-900/40 hover:border-accent-purple/50 hover:bg-dark-800/80 hover:shadow-neon-purple transition duration-300 relative overflow-hidden"
                            >
                                <div className="absolute right-0 top-0 bottom-0 w-1 bg-accent-purple scale-y-0 group-hover:scale-y-100 transition-transform duration-300 origin-bottom"></div>
                                <h3 className="text-gray-200 font-medium group-hover:text-white transition-colors">{p.name}</h3>
                                <p className="text-xs text-gray-500 mt-1 flex items-center gap-2 group-hover:text-accent-purple/70 transition-colors">
                                    <span className="w-2 h-2 rounded-full bg-accent-purple/50"></span>
                                    {p.files?.length || 1} file(s)
                                </p>
                            </motion.div>
                        ))}
                    </div>
                </AnimatedCard>
            </div>
        </div>
    );
};
