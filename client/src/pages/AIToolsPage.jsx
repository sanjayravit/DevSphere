
import React, { useState } from 'react';
import api from '../services/api';
import { AnimatedCard } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { FileText, Sparkles, Upload, CheckCircle2, AlertTriangle, ChevronRight, File, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export const AIToolsPage = () => {
    const [resumeText, setResumeText] = useState('');
    const [selectedFile, setSelectedFile] = useState(null);
    const [isDragging, setIsDragging] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [results, setResults] = useState(null);

    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        const files = e.dataTransfer.files;
        if (files && files.length > 0) handleFileSelect(files[0]);
    };

    const handleFileSelect = (file) => {
        const ext = file.name.split('.').pop().toLowerCase();
        if (ext === 'pdf' || ext === 'txt') {
            setSelectedFile(file);
            setResumeText(''); // Clear text when file is prioritized
        } else {
            alert('Please upload a PDF or TXT file.');
        }
    };

    const handleAnalyze = async (e) => {
        e.preventDefault();
        if (!resumeText.trim() && !selectedFile) return;

        setIsAnalyzing(true);
        setResults(null);

        try {
            let res;
            if (selectedFile) {
                const formData = new FormData();
                formData.append('file', selectedFile);
                res = await api.post('/ai/resume-upload', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
            } else {
                res = await api.post('/ai/resume', { text: resumeText });
            }

            setResults({
                score: res.data.score || 0,
                summary: res.data.summary || "Scan complete.",
                strengths: res.data.strengths || [],
                improvements: res.data.improvements || []
            });
        } catch (err) {
            setResults({
                score: 0,
                summary: err.response?.data?.error || "Failed to analyze the resume. Did you configure the GEMINI_API_KEY?",
                strengths: [],
                improvements: []
            });
        } finally {
            setIsAnalyzing(false);
        }
    };

    return (
        <div className="max-w-6xl mx-auto space-y-8 px-4">
            <div className="mb-8">
                <h1 className="text-2xl md:text-3xl font-display font-bold text-white mb-2 flex items-center gap-3">
                    <Sparkles className="text-accent-purple" />
                    AI Resume Analyzer
                </h1>
                <p className="text-gray-400 text-sm md:text-base">Get instant AI-driven feedback on your resume to increase your interview chances.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Input Area */}
                <AnimatedCard className="border border-white/5 h-max">
                    <form onSubmit={handleAnalyze}>
                        <div className="mb-6">
                            <div className="flex items-center gap-2 mb-4">
                                <FileText className="text-primary-400" />
                                <h2 className="text-xl font-semibold text-white">Upload or Paste Resume</h2>
                            </div>

                            {/* Drag and Drop Zone */}
                            <div
                                className={`mb-4 w-full rounded-2xl border-2 border-dashed p-4 md:p-6 text-center transition-all duration-300 ${isDragging ? 'border-primary-500 bg-primary-500/10 scale-[1.02]' : selectedFile ? 'border-green-500/50 bg-green-500/5' : 'border-white/10 hover:border-primary-500/30 bg-dark-900/50'} relative cursor-pointer`}
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onDrop={handleDrop}
                                onClick={() => !selectedFile && document.getElementById('resume-upload').click()}
                            >
                                <input type="file" id="resume-upload" className="hidden" accept=".pdf,.txt" onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])} />

                                {selectedFile ? (
                                    <div className="flex items-center justify-between bg-dark-800 p-3 rounded-xl border border-white/5 shadow-lg" onClick={(e) => e.stopPropagation()}>
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 md:w-12 md:h-12 rounded-lg bg-primary-500/20 flex items-center justify-center text-primary-400 shadow-[inset_0_0_10px_rgba(99,102,241,0.2)]">
                                                <File size={22} />
                                            </div>
                                            <div className="text-left">
                                                <p className="text-sm font-bold text-white truncate max-w-[150px] md:max-w-[200px]">{selectedFile.name}</p>
                                                <p className="text-[10px] md:text-xs text-gray-400 font-medium">Local Document • {(selectedFile.size / 1024).toFixed(1)} KB</p>
                                            </div>
                                        </div>
                                        <button type="button" onClick={() => setSelectedFile(null)} className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-400/20 rounded-lg transition-colors">
                                            <X size={18} />
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center gap-3 py-2">
                                        <div className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-white/5 flex items-center justify-center text-gray-400 mb-1 group hover:bg-white/10 transition-colors">
                                            <Upload size={22} className="text-primary-400" />
                                        </div>
                                        <p className="text-sm font-semibold text-white">Upload or drag & drop</p>
                                        <p className="text-[10px] md:text-xs text-gray-500 font-medium tracking-wide">PDF or TXT (Max 5MB)</p>
                                    </div>
                                )}
                            </div>

                            <div className="relative flex items-center py-4 md:py-5">
                                <div className="flex-grow border-t border-white/5"></div>
                                <span className="flex-shrink-0 mx-4 text-gray-600 text-[9px] md:text-[10px] font-bold uppercase tracking-widest">Or Paste Text</span>
                                <div className="flex-grow border-t border-white/5"></div>
                            </div>

                            <textarea
                                value={resumeText}
                                onChange={(e) => {
                                    setResumeText(e.target.value);
                                    if (selectedFile && e.target.value.trim().length > 0) setSelectedFile(null); // Deselect file if they start typing
                                }}
                                placeholder="Paste your plain text resume here…"
                                className="w-full h-40 md:h-48 bg-dark-900/50 border border-white/10 rounded-xl p-4 text-white placeholder:text-gray-500 focus:outline-none focus:border-primary-500 transition-colors custom-scrollbar resize-none font-sans text-sm leading-relaxed"
                            />
                        </div>

                        <Button
                            type="submit"
                            className="w-full gap-2 shadow-neon-blue h-12 text-base rounded-xl border border-primary-500/50"
                            isLoading={isAnalyzing}
                            disabled={(!resumeText.trim() && !selectedFile)}
                        >
                            <Sparkles size={18} /> {isAnalyzing ? 'Analyzing…' : 'Analyze Resume'}
                        </Button>
                    </form>
                </AnimatedCard>

                {/* Results Area */}
                <div className="lg:col-span-1 border-white/5 pl-0 lg:pl-10 flex flex-col items-center justify-center pt-8 lg:pt-0">
                    <AnimatePresence mode="wait">
                        {isAnalyzing && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="h-full w-full flex flex-col items-center justify-center text-center p-8 md:p-12 glass-panel border border-primary-500/20 shadow-[inset_0_0_50px_rgba(99,102,241,0.05)]"
                            >
                                <div className="relative mb-8">
                                    <div className="w-16 h-16 md:w-20 md:h-20 border-4 border-primary-500/20 border-t-primary-500 rounded-full animate-spin"></div>
                                    <Sparkles className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-primary-400" size={18} />
                                </div>
                                <h3 className="text-xl font-medium text-white mb-2">AI is reading…</h3>
                                <p className="text-primary-400/80 animate-pulse text-sm">Running advanced heuristics...</p>
                            </motion.div>
                        )}

                        {results && !isAnalyzing && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="space-y-6 w-full"
                            >
                                {/* Score Card */}
                                <AnimatedCard delay={0.1} className="flex flex-col sm:flex-row items-center gap-4 sm:gap-8 bg-gradient-to-br from-dark-800 to-dark-900 border-primary-500/30 shadow-neon-blue p-6">
                                    <div className="relative shrink-0">
                                        <svg className="w-20 h-20 md:w-24 md:h-24 transform -rotate-90">
                                            <circle cx="40" cy="40" r="32" stroke="currentColor" strokeWidth="6" fill="transparent" className="text-dark-700 md:hidden" />
                                            <circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-dark-700 hidden md:block" />
                                            <circle
                                                cx="40" cy="40" r="32"
                                                stroke="currentColor"
                                                strokeWidth="6"
                                                fill="transparent"
                                                strokeDasharray={32 * 2 * Math.PI}
                                                strokeDashoffset={32 * 2 * Math.PI - (results.score / 100) * 32 * 2 * Math.PI}
                                                className={`md:hidden ${results.score > 80 ? "text-green-500" : "text-yellow-500"}`}
                                            />
                                            <circle
                                                cx="48" cy="48" r="40"
                                                stroke="currentColor"
                                                strokeWidth="8"
                                                fill="transparent"
                                                strokeDasharray={40 * 2 * Math.PI}
                                                strokeDashoffset={40 * 2 * Math.PI - (results.score / 100) * 40 * 2 * Math.PI}
                                                className={`hidden md:block ${results.score > 80 ? "text-green-500" : "text-yellow-500"}`}
                                            />
                                        </svg>
                                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-xl md:text-2xl font-bold text-white">
                                            {results.score}
                                        </div>
                                    </div>
                                    <div className="text-center sm:text-left">
                                        <h3 className="text-xl md:text-2xl font-bold text-white mb-1">ATS Match Score</h3>
                                        <p className="text-gray-400 text-xs md:text-sm">Based on standard tech industry filtering.</p>
                                    </div>
                                </AnimatedCard>

                                {/* Summary */}
                                <AnimatedCard delay={0.2} className="border border-white/5">
                                    <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                                        <Sparkles size={18} className="text-accent-purple" /> AI Summary
                                    </h3>
                                    <p className="text-gray-300 leading-relaxed text-sm">{results.summary}</p>
                                </AnimatedCard>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                    {/* Strengths */}
                                    <AnimatedCard delay={0.3} className="border border-green-500/20 bg-green-500/5">
                                        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                            <CheckCircle2 size={18} className="text-green-400" /> Strengths
                                        </h3>
                                        <ul className="space-y-3">
                                            {results.strengths.map((s, i) => (
                                                <li key={i} className="flex gap-2 text-sm items-start text-gray-300">
                                                    <ChevronRight size={16} className="text-green-400 shrink-0 mt-0.5" />
                                                    <span>{s}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </AnimatedCard>

                                    {/* Improvements */}
                                    <AnimatedCard delay={0.4} className="border border-yellow-500/20 bg-yellow-500/5">
                                        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                            <AlertTriangle size={18} className="text-yellow-400" /> To Improve
                                        </h3>
                                        <ul className="space-y-3">
                                            {results.improvements.map((s, i) => (
                                                <li key={i} className="flex gap-2 text-sm items-start text-gray-300">
                                                    <ChevronRight size={16} className="text-yellow-400 shrink-0 mt-0.5" />
                                                    <span>{s}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </AnimatedCard>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
};
