import React, { useState, useEffect } from 'react';
import { Download, Code, Sparkles, TerminalSquare, Box } from 'lucide-react';
import api from '../services/api';
import { useWorkspace } from '../context/WorkspaceContext';
import { AnimatedCard } from '../components/ui/Card';
import { Button } from '../components/ui/Button';

export const MarketplacePage = () => {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [installingId, setInstallingId] = useState(null);
    const { activeProject } = useWorkspace(); // If in a specific project context, we can extract this. For SaaS we might just pick the global active one or show a selector. Currently, installing might require knowing the active project.

    // We will assume `activeProject` is globally stored or we show a dropdown. For now, assume null installs globally or fails if no project active.

    useEffect(() => {
        fetchItems();
    }, []);

    const fetchItems = async () => {
        try {
            const res = await api.get('/marketplace');
            if (res.data.length === 0) {
                // Auto seed on mount for demo
                await api.post('/marketplace/seed');
                const seeded = await api.get('/marketplace');
                setItems(seeded.data);
            } else {
                setItems(res.data);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleInstall = async (id) => {
        if (!activeProject && !window.confirm("You have no active project selected in the sidebar. The item will just be flagged as downloaded. Continue?")) {
            return;
        }

        setInstallingId(id);
        try {
            await api.post(`/marketplace/${id}/install`, { projectId: activeProject?.id });
            alert("Successfully installed into your active project workspace.");
            fetchItems(); // refresh downloads count
        } catch (err) {
            alert(err.response?.data?.error || "Installation failed.");
        } finally {
            setInstallingId(null);
        }
    };

    const getIcon = (type) => {
        switch (type) {
            case 'template': return <Box className="text-blue-400" size={24} />;
            case 'snippet': return <Code className="text-green-400" size={24} />;
            case 'prompt': return <Sparkles className="text-purple-400" size={24} />;
            default: return <TerminalSquare size={24} />;
        }
    };

    return (
        <div className="p-8 max-w-7xl mx-auto min-h-screen">
            <div className="flex items-center justify-between mb-12">
                <div>
                    <h1 className="text-4xl font-display font-bold text-white mb-2 relative inline-block">
                        DevSphere Marketplace
                        <div className="absolute -inset-1 bg-gradient-to-r from-accent-purple/20 to-primary-500/20 blur-lg -z-10 rounded-full" />
                    </h1>
                    <p className="text-gray-400 text-lg">Browse curated templates, advanced AI prompts, and component snippets.</p>
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <div className="w-12 h-12 border-4 border-primary-500/20 border-t-primary-500 rounded-full animate-spin" />
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {items.map((item, idx) => (
                        <AnimatedCard key={item.id} delay={idx * 0.1} className="bg-dark-800/80 border border-white/5 p-6 flex flex-col items-start hover:border-white/10 transition-colors">
                            <div className="w-12 h-12 rounded-xl bg-dark-900 border border-white/5 flex flex-col items-center justify-center mb-6 shadow-xl">
                                {getIcon(item.type)}
                            </div>

                            <h3 className="text-xl font-bold text-white mb-2">{item.title}</h3>
                            <p className="text-sm text-gray-400 mb-6 flex-1 line-clamp-3 leading-relaxed">{item.description}</p>

                            <div className="flex flex-wrap gap-2 mb-6 w-full">
                                <span className="px-2 py-1 text-[10px] uppercase tracking-wider font-semibold rounded bg-dark-900 border border-white/5 text-gray-300">
                                    {item.type}
                                </span>
                                {item.tags.map(t => (
                                    <span key={t} className="px-2 py-1 text-[10px] uppercase tracking-wider font-semibold rounded bg-primary-500/10 text-primary-400">
                                        {t}
                                    </span>
                                ))}
                            </div>

                            <div className="w-full pt-6 border-t border-white/5 mt-auto flex items-center justify-between">
                                <div className="text-xs text-gray-500 font-medium">
                                    By {item.authorName || 'Anonymous'} • {item.downloads} installs
                                </div>
                                <Button
                                    size="sm"
                                    onClick={() => handleInstall(item.id)}
                                    isLoading={installingId === item.id}
                                    className="gap-2 px-4 shadow-[0_0_15px_rgba(var(--primary-rgb),0.3)] min-w-[100px]"
                                >
                                    <Download size={14} /> Install
                                </Button>
                            </div>
                        </AnimatedCard>
                    ))}
                </div>
            )}
        </div>
    );
};
