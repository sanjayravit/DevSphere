import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { Layout } from './components/layout/Layout';

// Lazy-loaded Pages
const LandingPage = React.lazy(() => import('./pages/LandingPage').then(m => ({ default: m.LandingPage })));
const LoginSignupPage = React.lazy(() => import('./pages/LoginSignupPage').then(m => ({ default: m.LoginSignupPage })));
const Dashboard = React.lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const SocialFeedPage = React.lazy(() => import('./pages/SocialFeedPage').then(m => ({ default: m.SocialFeedPage })));
const CodeEditorPage = React.lazy(() => import('./pages/CodeEditorPage').then(m => ({ default: m.CodeEditorPage })));
const ProfilePage = React.lazy(() => import('./pages/ProfilePage').then(m => ({ default: m.ProfilePage })));
const AIToolsPage = React.lazy(() => import('./pages/AIToolsPage').then(m => ({ default: m.AIToolsPage })));
const RepositoryViewerPage = React.lazy(() => import('./pages/RepositoryViewerPage').then(m => ({ default: m.RepositoryViewerPage })));

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<div className="h-screen w-screen flex flex-col items-center justify-center bg-dark-900 text-primary-400 gap-4"><div className="w-12 h-12 border-4 border-primary-500/20 border-t-primary-500 rounded-full animate-spin"></div><div className="font-medium tracking-widest text-sm">LOADING DEVPHERE…</div></div>}>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginSignupPage />} />

            {/* Protected Routes inside Layout */}
            <Route element={<Layout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/feed" element={<SocialFeedPage />} />
              <Route path="/editor" element={<CodeEditorPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/ai-tools" element={<AIToolsPage />} />
              <Route path="/repo/:owner/:repoName" element={<RepositoryViewerPage />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
