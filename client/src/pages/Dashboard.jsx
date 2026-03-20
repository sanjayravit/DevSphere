import React from 'react';
import { useAuth } from '../context/AuthContext';
import { AnimatedCard } from '../components/ui/Card';
import { Activity, GitMerge, Star, Users, FolderDot } from 'lucide-react';
import { motion } from 'framer-motion';

export const Dashboard = () => {
    const { user } = useAuth();

    const stats = [
        { label: 'Active Projects', value: '12', icon: FolderDot, color: 'text-accent-blue' },
        { label: 'Total Commits', value: '2,841', icon: GitMerge, color: 'text-primary-500' },
        { label: 'Followers', value: '841', icon: Users, color: 'text-accent-purple' },
        { label: 'Stars Earned', value: '4.2k', icon: Star, color: 'text-yellow-500' },
    ];

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-display font-bold text-white mb-2">
                        Welcome back, <span className="text-gradient">{user?.name?.split(' ')[0] || 'Developer'}</span>
                    </h1>
                    <p className="text-gray-400">Here's what's happening in your workspace today.</p>
                </div>
                <div className="flex gap-2">
                    {/* Action buttons could go here */}
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {stats.map((stat, i) => (
                    <AnimatedCard key={stat.label} delay={i * 0.1} className="flex flex-col">
                        <div className="flex items-center gap-3 mb-4">
                            <div className={`w-10 h-10 rounded-lg bg-dark-900/50 flex items-center justify-center border border-white/5 ${stat.color}`}>
                                <stat.icon size={20} />
                            </div>
                            <span className="text-gray-400 font-medium">{stat.label}</span>
                        </div>
                        <span className="text-3xl font-bold text-white tracking-tight">{stat.value}</span>
                    </AnimatedCard>
                ))}
            </div>

            {/* Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Recent Activity */}
                <AnimatedCard delay={0.4} className="lg:col-span-2">
                    <div className="flex items-center gap-2 mb-6">
                        <Activity className="text-primary-400" size={20} />
                        <h2 className="text-xl font-semibold text-white">Recent Activity</h2>
                    </div>

                    <div className="space-y-4">
                        {[1, 2, 3, 4].map((item) => (
                            <div key={item} className="flex gap-4 p-4 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors">
                                <div className="w-10 h-10 rounded-full bg-primary-500/20 flex items-center justify-center shrink-0">
                                    <GitMerge size={16} className="text-primary-400" />
                                </div>
                                <div>
                                    <p className="text-white text-sm">
                                        <span className="font-medium">You</span> pushed to <span className="text-primary-400 font-medium border-b border-primary-500/30">main</span> in devsphere/client
                                    </p>
                                    <p className="text-xs text-gray-500 mt-1">2 hours ago</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </AnimatedCard>

                {/* Quick Links / Top Projects */}
                <AnimatedCard delay={0.5}>
                    <div className="flex items-center gap-2 mb-6">
                        <FolderDot className="text-accent-purple" size={20} />
                        <h2 className="text-xl font-semibold text-white">Pinned Projects</h2>
                    </div>
                    <div className="space-y-3">
                        {[
                            { name: 'DevSphere App', lang: 'TypeScript' },
                            { name: 'Gemini Integration', lang: 'Python' },
                            { name: 'UI Components', lang: 'React' }
                        ].map((p, i) => (
                            <div key={i} className="group cursor-pointer p-4 rounded-xl border border-white/5 bg-dark-900/40 hover:border-primary-500/50 transition-all">
                                <h3 className="text-white font-medium group-hover:text-primary-400 transition-colors">{p.name}</h3>
                                <p className="text-xs text-gray-500 mt-1">{p.lang}</p>
                            </div>
                        ))}
                    </div>
                </AnimatedCard>
            </div>
        </div>
    );
};
