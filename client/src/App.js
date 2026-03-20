import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { Layout } from './components/layout/Layout';

// Pages
import { LandingPage } from './pages/LandingPage';
import { LoginSignupPage } from './pages/LoginSignupPage';

// Placeholder Pages (To be built next)
const Dashboard = () => <div className="text-white"><h1 className="text-2xl font-bold mb-4">Dashboard</h1><p>Welcome to DevSphere Dashboard.</p></div>;
const SocialFeedPage = () => <div className="text-white"><h1 className="text-2xl font-bold mb-4">Social Feed</h1></div>;
const CodeEditorPage = () => <div className="text-white"><h1 className="text-2xl font-bold mb-4">Code Editor</h1></div>;
const ProfilePage = () => <div className="text-white"><h1 className="text-2xl font-bold mb-4">Profile</h1></div>;
const AIToolsPage = () => <div className="text-white"><h1 className="text-2xl font-bold mb-4">AI Tools</h1></div>;

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
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
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
