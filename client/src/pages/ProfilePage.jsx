import React, { useState } from 'react';
import axios from 'axios';
import { AnimatedCard } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Github, Users, Star, GitFork, ExternalLink, MapPin, Building, Link as LinkIcon } from 'lucide-react';

export const ProfilePage = () => {
    const [username, setUsername] = useState('');
    const [profile, setProfile] = useState(null);
    const [repos, setRepos] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const fetchGithubProfile = async (e) => {
        e.preventDefault();
        if (!username.trim()) return;

        setLoading(true);
        setError('');

        try {
            const [profileRes, reposRes] = await Promise.all([
                axios.get(`https://api.github.com/users/${username}`),
                axios.get(`https://api.github.com/users/${username}/repos?sort=updated&per_page=6`)
            ]);

            setProfile(profileRes.data);
            setRepos(reposRes.data);
        } catch (err) {
            setError('GitHub user not found or API rate limit exceeded.');
            setProfile(null);
            setRepos([]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-8 max-w-5xl mx-auto">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                <div>
                    <h1 className="text-3xl font-display font-bold text-white mb-2">GitHub Profile Import</h1>
                    <p className="text-gray-400">Connect your GitHub to showcase your portfolio and stats.</p>
                </div>

                <form onSubmit={fetchGithubProfile} className="flex gap-3 w-full md:w-auto">
                    <Input
                        icon={Github}
                        placeholder="Enter GitHub Username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="w-full md:w-64"
                    />
                    <Button type="submit" isLoading={loading}>Fetch</Button>
                </form>
            </div>

            {error && (
                <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-center">
                    {error}
                </div>
            )}

            {!profile && !loading && !error && (
                <AnimatedCard className="text-center py-20 border-dashed border-2 border-white/10 bg-transparent shadow-none">
                    <div className="w-16 h-16 mx-auto rounded-full bg-dark-700 flex items-center justify-center mb-4">
                        <Github size={32} className="text-gray-500" />
                    </div>
                    <h3 className="text-xl font-medium text-white mb-2">No Profile Connected</h3>
                    <p className="text-gray-500 max-w-sm mx-auto">
                        Enter your GitHub username above to instantly import your repositories and developer statistics.
                    </p>
                </AnimatedCard>
            )}

            {profile && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Profile Sidebar */}
                    <AnimatedCard className="lg:col-span-1 h-max top-4 sticky">
                        <div className="text-center">
                            <img
                                src={profile.avatar_url}
                                alt={profile.login}
                                className="w-32 h-32 rounded-full mx-auto border-4 border-dark-900 shadow-neon-blue mb-4 object-cover"
                            />
                            <h2 className="text-2xl font-bold text-white">{profile.name || profile.login}</h2>
                            <a
                                href={profile.html_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary-400 hover:text-primary-300 transition-colors text-sm font-medium"
                            >
                                @{profile.login}
                            </a>

                            {profile.bio && (
                                <p className="text-gray-400 mt-4 text-sm leading-relaxed">{profile.bio}</p>
                            )}

                            <div className="flex items-center justify-center gap-4 mt-6">
                                <div className="flex items-center gap-1 text-gray-300">
                                    <Users size={16} className="text-gray-500" />
                                    <span className="font-semibold">{profile.followers}</span>
                                    <span className="text-xs text-gray-500 uppercase tracking-wider">followers</span>
                                </div>
                                <div className="flex items-center gap-1 text-gray-300">
                                    <span className="font-semibold">{profile.following}</span>
                                    <span className="text-xs text-gray-500 uppercase tracking-wider">following</span>
                                </div>
                            </div>

                            <div className="mt-8 space-y-3 text-sm text-left border-t border-white/10 pt-6">
                                {profile.company && (
                                    <div className="flex items-center gap-3 text-gray-400">
                                        <Building size={16} /> <span>{profile.company}</span>
                                    </div>
                                )}
                                {profile.location && (
                                    <div className="flex items-center gap-3 text-gray-400">
                                        <MapPin size={16} /> <span>{profile.location}</span>
                                    </div>
                                )}
                                {profile.blog && (
                                    <div className="flex items-center gap-3 text-primary-400 hover:underline">
                                        <LinkIcon size={16} /> <a href={profile.blog.startsWith('http') ? profile.blog : `https://${profile.blog}`} target="_blank" rel="noreferrer">{profile.blog}</a>
                                    </div>
                                )}
                            </div>
                        </div>
                    </AnimatedCard>

                    {/* Repositories */}
                    <div className="lg:col-span-2 space-y-6">
                        <h3 className="text-xl font-bold text-white flex items-center gap-2">
                            <Github size={20} /> Recent Repositories
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {repos.map((repo, i) => (
                                <AnimatedCard key={repo.id} delay={0.1 * i} className="flex flex-col hover:border-primary-500/30 transition-colors cursor-pointer" onClick={() => window.open(repo.html_url, '_blank')}>
                                    <div className="flex justify-between items-start mb-2">
                                        <h4 className="text-white font-semibold text-lg truncate pr-4 text-primary-400 hover:underline">
                                            {repo.name}
                                        </h4>
                                        <ExternalLink size={16} className="text-gray-500 shrink-0 mt-1" />
                                    </div>
                                    <p className="text-sm text-gray-400 line-clamp-2 mb-4 flex-1">
                                        {repo.description || 'No description provided.'}
                                    </p>

                                    <div className="flex items-center gap-4 text-xs font-medium mt-auto pt-4 border-t border-white/5">
                                        {repo.language && (
                                            <div className="flex items-center gap-1.5 text-gray-300">
                                                <span className="w-2.5 h-2.5 rounded-full bg-accent-blue"></span>
                                                {repo.language}
                                            </div>
                                        )}
                                        <div className="flex items-center gap-1 text-gray-400 hover:text-yellow-500 transition-colors">
                                            <Star size={14} /> {repo.stargazers_count}
                                        </div>
                                        <div className="flex items-center gap-1 text-gray-400 hover:text-white transition-colors">
                                            <GitFork size={14} /> {repo.forks_count}
                                        </div>
                                    </div>

                                    {/* Open in DevSphere action button */}
                                    <div className="mt-4">
                                        <Button
                                            variant="outline"
                                            className="w-full gap-2 border-white/10 hover:border-primary-500/50"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                window.open(`/repo/${repo.owner.login}/${repo.name}`, "_blank");
                                            }}
                                        >
                                            <LinkIcon size={16} /> Open in DevSphere Workspace
                                        </Button>
                                    </div>
                                </AnimatedCard>
                            ))}
                        </div>

                        {repos.length === 0 && (
                            <div className="text-center py-10 text-gray-500">
                                No public repositories found.
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
