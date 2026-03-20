
import React from 'react';
import { useAuth } from '../context/AuthContext';
import { AnimatedCard } from '../components/ui/Card';
import { Activity, GitMerge, Star, Users, FolderDot } from 'lucide-react';
import { motion } from 'framer-motion';

const MOCK_ACTIVITY = [1, 2, 3, 4];

const PINNED_PROJECTS = [
    { name: 'DevSphere App', lang: 'TypeScript' },
    { name: 'Gemini Integration', lang: 'Python' },
    { name: 'UI Components', lang: 'React' }
];

const STATS_DATA = [
    { label: 'Active Projects', value: '12', icon: FolderDot, color: 'text-accent-blue' },
    { label: 'Total Commits', value: '2,841', icon: GitMerge, color: 'text-primary-500' },
    { label: 'Followers', value: '841', icon: Users, color: 'text-accent-purple' },
    { label: 'Stars Earned', value: '4.2k', icon: Star, color: 'text-yellow-500' },
];

export const Dashboard = () => {
    const { user } = useAuth();

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
                {/* Recent Activity */}
                <AnimatedCard delay={0.4} className="lg:col-span-2">
                    <div className="flex items-center gap-2 mb-6">
                        <Activity className="text-primary-400" size={20} />
                        <h2 className="text-xl font-semibold text-white">Recent Activity</h2>
                    </div>

                    <div className="space-y-4">
                        {MOCK_ACTIVITY.map((item, i) => (
                            <motion.div
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.5 + (i * 0.1), duration: 0.5, ease: "easeOut" }}
                                key={item}
                                className="flex gap-4 p-4 rounded-xl bg-dark-900/40 border border-white/5 hover:bg-dark-800/80 hover:border-primary-500/30 transition duration-300 group cursor-default relative overflow-hidden"
                            >
                                <div className="absolute inset-0 bg-gradient-to-r from-primary-500/0 to-primary-500/5 transform -translate-x-full group-hover:translate-x-0 transition-transform duration-700"></div>
                                <div className="w-10 h-10 rounded-full bg-primary-500/10 flex items-center justify-center shrink-0 border border-primary-500/20 group-hover:shadow-[0_0_15px_rgba(99,102,241,0.4)] group-hover:bg-primary-500/20 transition duration-300">
                                    <GitMerge size={16} className="text-primary-400" />
                                </div>
                                <div className="relative z-10">
                                    <p className="text-gray-200 text-sm">
                                        <span className="font-semibold text-white">You</span> pushed to <span className="text-primary-400 font-medium group-hover:text-accent-blue transition-colors px-1 py-0.5 rounded bg-primary-500/10">main</span> in devsphere/client
                                    </p>
                                    <p className="text-xs text-gray-500 mt-1.5 font-medium">2 hours ago</p>
                                </div>
                            </motion.div>
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
                        {PINNED_PROJECTS.map((p, i) => (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.7 + (i * 0.1), duration: 0.4 }}
                                key={i}
                                className="group cursor-pointer p-4 rounded-xl border border-white/5 bg-dark-900/40 hover:border-accent-purple/50 hover:bg-dark-800/80 hover:shadow-neon-purple transition duration-300 relative overflow-hidden"
                            >
                                <div className="absolute right-0 top-0 bottom-0 w-1 bg-accent-purple scale-y-0 group-hover:scale-y-100 transition-transform duration-300 origin-bottom"></div>
                                <h3 className="text-gray-200 font-medium group-hover:text-white transition-colors">{p.name}</h3>
                                <p className="text-xs text-gray-500 mt-1 group-hover:text-accent-purple/70 transition-colors">{p.lang}</p>
                            </motion.div>
                        ))}
                    </div>
                </AnimatedCard>
            </div>
        </div>
    );
};
