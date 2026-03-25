import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { AnimatedCard } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Mail, Lock, User, TerminalSquare, Github } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export const LoginSignupPage = () => {
    const [isLogin, setIsLogin] = useState(true);
    const [formData, setFormData] = useState({ name: '', email: '', password: '' });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { login, register, setAuthToken } = useAuth();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    useEffect(() => {
        const token = searchParams.get('token');
        if (token) {
            setLoading(true);
            setAuthToken(token).then(() => navigate('/dashboard'));
        }
        const err = searchParams.get('error');
        if (err) setError("GitHub authentication failed.");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams]);

    const handleGithubLogin = () => {
        window.location.href = process.env.REACT_APP_GITHUB_AUTH_URL || '/api/auth/github';
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (!formData.email || !formData.password || (!isLogin && !formData.name)) {
            setError('Please fill in all fields');
            return;
        }

        setLoading(true);
        try {
            if (isLogin) {
                await login(formData.email, formData.password);
            } else {
                await register(formData.name, formData.email, formData.password);
            }
            navigate('/dashboard');
        } catch (err) {
            setError(err.response?.data?.error || 'Authentication failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    return (
        <div className="min-h-screen bg-dark-900 flex items-center justify-center p-4 relative overflow-hidden">
            {/* Premium Background Effects */}
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary-500/20 rounded-full blur-[100px]" />
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent-purple/20 rounded-full blur-[100px]" />
            <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay pointer-events-none"></div>

            <AnimatedCard className="w-full max-w-md relative z-10 border border-white/10 shadow-2xl bg-dark-800/80 backdrop-blur-2xl">
                <div className="text-center mb-8">
                    <div className="mx-auto w-12 h-12 rounded-xl bg-gradient-to-tr from-primary-500 to-accent-purple flex items-center justify-center shadow-neon-purple mb-4">
                        <TerminalSquare size={24} className="text-white" />
                    </div>
                    <h2 className="text-3xl font-display font-bold text-white mb-2">
                        {isLogin ? 'Welcome back' : 'Create an account'}
                    </h2>
                    <p className="text-gray-400">
                        {isLogin ? 'Enter your details to access your workspace.' : 'Join the most advanced developer platform.'}
                    </p>
                </div>

                {error && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mb-6 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-sm text-center"
                    >
                        {error}
                    </motion.div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <AnimatePresence mode="popLayout">
                        {!isLogin && (
                            <motion.div
                                initial={{ opacity: 0, height: 0, scale: 0.9 }}
                                animate={{ opacity: 1, height: 'auto', scale: 1 }}
                                exit={{ opacity: 0, height: 0, scale: 0.9 }}
                                transition={{ duration: 0.2 }}
                            >
                                <Input
                                    icon={User}
                                    name="name"
                                    placeholder="Full Name"
                                    value={formData.name}
                                    onChange={handleChange}
                                />
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <Input
                        type="email"
                        icon={Mail}
                        name="email"
                        placeholder="Email Address"
                        value={formData.email}
                        onChange={handleChange}
                    />

                    <Input
                        type="password"
                        icon={Lock}
                        name="password"
                        placeholder="Password"
                        value={formData.password}
                        onChange={handleChange}
                    />

                    <Button
                        type="submit"
                        className="w-full mt-6"
                        isLoading={loading}
                    >
                        {isLogin ? 'Sign In' : 'Sign Up'}
                    </Button>
                </form>

                <div className="relative my-6">
                    <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-white/10"></div>
                    </div>
                    <div className="relative flex justify-center text-sm">
                        <span className="px-2 bg-dark-800/80 text-gray-500">Or continue with</span>
                    </div>
                </div>

                <Button
                    variant="secondary"
                    onClick={handleGithubLogin}
                    className="w-full bg-[#24292e] text-white hover:bg-[#2f363d] border-white/10 flex items-center justify-center gap-3"
                >
                    <Github size={18} /> Default GitHub Proxy
                </Button>

                <div className="mt-8 text-center">
                    <button
                        onClick={() => {
                            setIsLogin(!isLogin);
                            setError('');
                        }}
                        className="text-gray-400 hover:text-white transition-colors text-sm"
                    >
                        {isLogin ? "Don't have an account? " : "Already have an account? "}
                        <span className="text-primary-400 font-medium">
                            {isLogin ? 'Sign up' : 'Sign in'}
                        </span>
                    </button>
                </div>
            </AnimatedCard>
        </div>
    );
};
