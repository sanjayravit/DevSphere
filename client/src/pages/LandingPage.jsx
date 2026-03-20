import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '../components/ui/Button';
import { TerminalSquare, Code2, Users, BrainCircuit } from 'lucide-react';

export const LandingPage = () => {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen bg-dark-900 overflow-hidden relative selection:bg-primary-500/30">
            {/* Abstract Background Elements */}
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>
            <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-primary-500/20 blur-[120px] pointer-events-none" />
            <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-accent-purple/20 blur-[120px] pointer-events-none" />
            <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.15] mix-blend-overlay pointer-events-none"></div>

            {/* Navigation */}
            <nav className="relative z-10 flex items-center justify-between px-6 py-6 max-w-7xl mx-auto">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-primary-500 to-accent-purple flex items-center justify-center shadow-neon-purple">
                        <TerminalSquare size={20} className="text-white" />
                    </div>
                    <span className="text-xl font-display font-bold text-white tracking-tight">DevSphere</span>
                </div>
                <div className="flex gap-4">
                    <Button variant="ghost" onClick={() => navigate('/login')}>Log in</Button>
                    <Button onClick={() => navigate('/login')}>Get Started</Button>
                </div>
            </nav>

            {/* Hero Section */}
            <main className="relative z-10 flex flex-col items-center justify-center px-6 pt-32 pb-20 text-center max-w-5xl mx-auto">
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                >
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-primary-400 text-sm font-medium mb-8">
                        <span className="flex w-2 h-2 rounded-full bg-primary-500 animate-pulse"></span>
                        The Future of Developer Collaboration
                    </div>
                    <h1 className="text-5xl md:text-7xl font-display font-bold text-white tracking-tight leading-tight mb-6">
                        Build software <br className="hidden md:block" />
                        <span className="text-gradient">faster, together.</span>
                    </h1>
                    <p className="text-lg md:text-xl text-gray-400 max-w-2xl mx-auto mb-10">
                        Combine the power of GitHub repositories, real-time code editing, developer social feeds, and advanced AI assistants in one premium platform.
                    </p>

                    <div className="flex flex-col sm:flex-row gap-4 justify-center">
                        <Button size="lg" className="text-lg px-8" onClick={() => navigate('/login')}>
                            Start Building Now
                        </Button>
                        <Button size="lg" variant="secondary" className="text-lg px-8 gap-2" onClick={() => navigate('/login')}>
                            <GithubIcon className="w-5 h-5" /> Import GitHub
                        </Button>
                    </div>
                </motion.div>

                {/* Feature Highlights */}
                <motion.div
                    initial={{ opacity: 0, y: 40 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 1, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
                    className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-32 w-full text-left"
                >
                    <FeatureCard
                        icon={Code2}
                        title="Real-time Editor"
                        desc="Collaborate with your team instantly. Code, compile, and run in browser."
                    />
                    <FeatureCard
                        icon={BrainCircuit}
                        title="AI Co-pilot"
                        desc="Explain code, fix bugs, and optimize functions with a click."
                    />
                    <FeatureCard
                        icon={Users}
                        title="Social Hub"
                        desc="Share knowledge, follow top devs, and build your network."
                    />
                </motion.div>
            </main>
        </div>
    );
};

const FeatureCard = ({ icon: Icon, title, desc }) => (
    <div className="glass-panel p-6 border border-white/5 hover:border-white/10 transition-colors">
        <div className="w-12 h-12 rounded-lg bg-primary-500/10 flex items-center justify-center mb-4 text-primary-400">
            <Icon size={24} />
        </div>
        <h3 className="text-xl font-semibold text-white mb-2">{title}</h3>
        <p className="text-gray-400 leading-relaxed">{desc}</p>
    </div>
);

const GithubIcon = (props) => (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
        <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
    </svg>
);
