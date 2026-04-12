import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { WorkspaceProvider } from './context/WorkspaceContext';
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
const MarketplacePage = React.lazy(() => import('./pages/MarketplacePage').then(m => ({ default: m.MarketplacePage })));
const SelfHealingPage = React.lazy(() => import('./pages/SelfHealingPage').then(m => ({ default: m.SelfHealingPage })));

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <WorkspaceProvider>
          <Suspense fallback={<div className="h-screen w-screen flex flex-col items-center justify-center bg-dark-900 text-primary-400 gap-4"><div className="w-12 h-12 border-4 border-primary-500/20 border-t-primary-500 rounded-full animate-spin"></div><div className="font-medium tracking-widest text-sm">LOADING DEVPHERE…</div></div>}>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/login" element={<LoginSignupPage />} />

              {/* Protected Routes using established Layout */}
              <Route element={<Layout />}>
                <Route path="/feed" element={<SocialFeedPage />} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/ai-tools" element={<AIToolsPage />} />
                <Route path="/repo/:owner/:repoName" element={<RepositoryViewerPage />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/self-healing" element={<SelfHealingPage />} />
                <Route path="/marketplace" element={<MarketplacePage />} />
                <Route path="/editor" element={<div className="p-8 text-center text-gray-500">Select or create a project to open the editor.</div>} />
                <Route path="/editor/:projectId" element={<CodeEditorPage />} />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </WorkspaceProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
