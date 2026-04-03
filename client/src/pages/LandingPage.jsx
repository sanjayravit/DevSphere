import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '../components/ui/Button';
import { TerminalSquare, Code2, Users, BrainCircuit, Play, Sparkles } from 'lucide-react';

export const LandingPage = () => {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen bg-dark-900 overflow-hidden relative selection:bg-primary-500/30 font-sans">
            {/* Immersive Background Effects */}
            <div className="absolute inset-0 bg-grid-pattern opacity-50 pointer-events-none"></div>
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-primary-500/50 to-transparent"></div>

            {/* Animated Blob Gradients */}
            <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-primary-500/30 blur-[120px] mix-blend-screen animate-blob pointer-events-none" />
            <div className="absolute top-[20%] right-[-10%] w-[40%] h-[40%] rounded-full bg-accent-purple/30 blur-[120px] mix-blend-screen animate-blob animation-delay-2000 pointer-events-none" />
            <div className="absolute bottom-[-10%] left-[20%] w-[60%] h-[60%] rounded-full bg-accent-blue/20 blur-[150px] mix-blend-screen animate-blob animation-delay-4000 pointer-events-none" />

            <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.2] mix-blend-overlay pointer-events-none"></div>

            {/* Premium Sticky Navigation */}
            <nav className="fixed top-0 w-full z-50 glass-panel border-x-0 border-t-0 rounded-none bg-dark-900/60 backdrop-blur-xl">
                <div className="flex items-center justify-between px-6 py-4 max-w-7xl mx-auto">
                    <div className="flex items-center gap-3 group cursor-pointer" onClick={() => navigate('/')}>
                        <div className="relative w-10 h-10 rounded-xl bg-dark-800 flex items-center justify-center border border-white/10 group-hover:border-primary-500/50 transition-colors overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-tr from-primary-500/20 to-accent-purple/20 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                            <TerminalSquare size={20} className="text-white relative z-10 drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]" />
                        </div>
                        <span className="text-2xl font-display font-bold text-white tracking-tight">
                            Dev<span className="text-primary-400">Sphere</span>
                        </span>
                    </div>
                    <div className="flex gap-4 items-center">
                        <Button variant="ghost" onClick={() => navigate('/login')} className="hover:text-white">Sign In</Button>
                        <Button onClick={() => navigate('/login')} className="shadow-neon-blue hover:scale-105 transition-transform">Get Started</Button>
                    </div>
                </div>
            </nav>

            {/* Breathtaking Hero Section */}
            <main className="relative z-10 flex flex-col items-center justify-center px-6 pt-48 pb-32 text-center max-w-7xl mx-auto min-h-screen">

                {/* Floating Mockups Background Layer */}
                <div className="absolute inset-0 pointer-events-none overflow-hidden z-0 hidden lg:block">
                    <motion.div
                        initial={{ opacity: 0, x: -100, y: 50, rotate: -10 }}
                        animate={{ opacity: 1, x: 0, y: 0, rotate: -5 }}
                        transition={{ duration: 1.5, delay: 0.2, ease: "easeOut" }}
                        className="absolute top-[20%] left-[5%] glass-panel p-4 border-white/10 shadow-2xl animate-float opacity-80"
                    >
                        <div className="flex items-center gap-2 mb-3 border-b border-white/10 pb-2">
                            <div className="flex gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-red-500" /><div className="w-2.5 h-2.5 rounded-full bg-yellow-500" /><div className="w-2.5 h-2.5 rounded-full bg-green-500" /></div>
                            <span className="text-xs text-gray-500 font-mono">App.tsx</span>
                        </div>
                        <pre className="text-left text-[10px] text-accent-blue font-mono leading-relaxed">
                            <span className="text-accent-purple">function</span> App() {'{\n'}
                            {'  '}return (<br />
                            {'    '}<span className="text-primary-400">&lt;ThemeProvider&gt;</span><br />
                            {'      '}<span className="text-primary-400">&lt;Router /&gt;</span><br />
                            {'    '}<span className="text-primary-400">&lt;/ThemeProvider&gt;</span><br />
                            {'  '});<br />
                            {'}'}
                        </pre>
                        <div className="absolute bottom-2 right-2 w-1.5 h-4 bg-primary-500 animate-pulse"></div>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, x: 100, y: -50, rotate: 10 }}
                        animate={{ opacity: 1, x: 0, y: 0, rotate: 5 }}
                        transition={{ duration: 1.5, delay: 0.4, ease: "easeOut" }}
                        className="absolute top-[15%] right-[5%] glass-panel p-4 border-white/10 shadow-2xl animate-float-delayed opacity-80 w-64"
                    >
                        <div className="flex items-center gap-2 mb-3 text-primary-400">
                            <Sparkles size={16} /> <span className="text-xs font-bold text-white">AI Co-pilot</span>
                        </div>
                        <div className="bg-dark-900/50 rounded-lg p-3 text-left">
                            <p className="text-[10px] text-gray-300 leading-relaxed mb-2">Here is the optimized function with <span className="text-accent-blue">O(n)</span> time complexity using a HashMap.</p>
                            <div className="h-2 w-3/4 bg-white/10 rounded overflow-hidden"><div className="w-1/2 h-full bg-primary-500"></div></div>
                        </div>
                    </motion.div>
                </div>

                <motion.div
                    initial={{ opacity: 0, y: 30, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
                    className="relative z-10 max-w-4xl"
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.2, duration: 0.8 }}
                        className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary-500/10 border border-primary-500/20 text-primary-400 text-sm font-semibold mb-8 shadow-[0_0_20px_rgba(99,102,241,0.2)] backdrop-blur-md"
                    >
                        <Sparkles size={14} className="animate-pulse" />
                        DevSphere 2.0 is highly immersive.
                    </motion.div>

                    <h1 className="text-6xl md:text-8xl font-display font-extrabold text-white tracking-tighter leading-[1.1] mb-8 drop-shadow-2xl">
                        Code at the speed <br className="hidden md:block" />
                        of <span className="text-gradient animate-pulse-glow px-2 rounded-xl bg-white/5">thought.</span>
                    </h1>

                    <p className="text-xl md:text-2xl text-gray-400 max-w-3xl mx-auto mb-12 font-medium leading-relaxed">
                        The ultimate developer ecosystem replacing GitHub. Featuring real-time multiplayer editing, built-in AI intelligence, and a thriving social network.
                    </p>

                    <div className="flex flex-col sm:flex-row gap-5 justify-center items-center">
                        <Button size="lg" className="text-lg px-10 py-6 h-auto rounded-2xl shadow-neon-blue group relative overflow-hidden" onClick={() => navigate('/login')}>
                            <span className="relative z-10 flex items-center gap-2 font-bold">Launch Workspace <Play size={18} className="fill-current" /></span>
                            <div className="absolute inset-0 bg-gradient-to-r from-accent-blue via-primary-500 to-accent-purple opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                        </Button>
                        <Button size="lg" variant="secondary" className="text-lg px-8 py-6 h-auto rounded-2xl gap-3 glass-panel hover:bg-white/5 border-white/10 hover:border-white/20 transition font-semibold text-gray-300 hover:text-white" onClick={() => navigate('/login')}>
                            <GithubIcon className="w-5 h-5" /> Import from GitHub
                        </Button>
                    </div>
                </motion.div>
            </main>

            {/* Feature Highlights with Scroll Triggers */}
            <section className="relative z-10 max-w-7xl mx-auto px-6 py-32 border-t border-white/5">
                <div className="text-center mb-20">
                    <h2 className="text-4xl md:text-5xl font-display font-bold text-white mb-4">Everything you need. <span className="text-gray-500">In one place.</span></h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <FeatureCard
                        icon={Code2}
                        title="Multiplayer Engine"
                        desc="Experience zero-latency cursor tracking and live compilation. Pair-program like you're in the same room."
                        delay={0.1}
                    />
                    <FeatureCard
                        icon={BrainCircuit}
                        title="Neural Co-pilot"
                        desc="Highlight any snippet to instantly explain logic, find deeply buried bugs, or optimize time complexity."
                        delay={0.2}
                    />
                    <FeatureCard
                        icon={Users}
                        title="Developer Network"
                        desc="Grow your portfolio seamlessly. Sync with GitHub, showcase repos, and build a following of top talent."
                        delay={0.3}
                    />
                </div>
            </section>
        </div>
    );
};

const FeatureCard = ({ icon: Icon, title, desc, delay }) => (
    <motion.div
        initial={{ opacity: 0, y: 50 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.7, delay, ease: "easeOut" }}
        className="group relative glass-panel p-8 border border-white/5 hover:border-primary-500/30 transition duration-200 overflow-hidden"
    >
        <div className="absolute inset-0 bg-gradient-to-br from-primary-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200"></div>
        <div className="relative z-10">
            <div className="w-14 h-14 rounded-2xl bg-dark-900 border border-white/10 flex items-center justify-center mb-6 text-white group-hover:scale-110 group-hover:text-primary-400 group-hover:border-primary-500/50 shadow-lg transition duration-200">
                <Icon size={28} />
            </div>
            <h3 className="text-2xl font-bold text-white mb-3 tracking-tight">{title}</h3>
            <p className="text-gray-400 leading-relaxed font-medium">{desc}</p>
        </div>
        <div className="absolute bottom-0 right-0 w-32 h-32 bg-primary-500/20 blur-[60px] rounded-full group-hover:bg-accent-blue/30 transition-colors duration-500 pointer-events-none"></div>
    </motion.div>
);

const GithubIcon = (props) => (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
        <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
    </svg>
);
