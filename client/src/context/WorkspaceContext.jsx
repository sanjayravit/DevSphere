import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import api from '../services/api';
import { useAuth } from './AuthContext';
const WorkspaceContext = createContext();
export const useWorkspace = () => useContext(WorkspaceContext);
export const WorkspaceProvider = ({ children }) => {
  const { user } = useAuth();
  const userId = user?.id;
  const [workspaces, setWorkspaces] = useState([]);
  const [activeWorkspace, setActiveWorkspace] = useState(null);
  const [projects, setProjects] = useState([]);
  const [activeProject, setActiveProjectState] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const scope = useRef({}); scope.current = { userId, workspaceId: activeWorkspace?.id };
  const projectRequest = useRef(0);
  useEffect(() => {
    let valid = true;
    projectRequest.current += 1;
    setWorkspaces([]); setProjects([]); setActiveWorkspace(null); setActiveProjectState(null); setError('');
    if (!userId) { setLoading(false); return undefined; }
    setLoading(true);
    api.get('/workspaces').then(response => {
      if (!valid) return;
      const items = response.data;
      setWorkspaces(items);
      const saved = localStorage.getItem(`devsphere-active-workspace:${userId}`);
      setActiveWorkspace(items.find(item => item.id === saved) || items[0] || null);
      if (!items.length) setLoading(false);
    }).catch(() => { if (valid) { setLoading(false); setError('Unable to load workspaces.'); } });
    return () => { valid = false; projectRequest.current += 1; };
  }, [userId]);
  const fetchProjects = useCallback(async workspaceId => {
    const request = ++projectRequest.current;
    setLoading(true); setError('');
    try {
      const response = await api.get(`/projects/workspace/${workspaceId}`);
      if (request !== projectRequest.current) return;
      setProjects(response.data);
      const saved = localStorage.getItem(`devsphere-active-project:${userId}`);
      setActiveProjectState(response.data.find(item => item.id === saved) || response.data[0] || null);
    } catch { if (request === projectRequest.current) setError('Unable to load projects.'); }
    finally { if (request === projectRequest.current) setLoading(false); }
  }, [userId]);
  useEffect(() => {
    setProjects([]); setActiveProjectState(null);
    if (activeWorkspace?.id) fetchProjects(activeWorkspace.id);
    return () => { projectRequest.current += 1; };
  }, [activeWorkspace?.id, fetchProjects]);
  const changeWorkspace = workspace => {
    projectRequest.current += 1;
    setActiveWorkspace(workspace); setProjects([]); setActiveProjectState(null);
    localStorage.setItem(`devsphere-active-workspace:${userId}`, workspace.id);
  };
  const setActiveProject = project => {
    setActiveProjectState(project);
    if (project?.id) localStorage.setItem(`devsphere-active-project:${userId}`, project.id);
  };
  const createWorkspace = async name => {
    const response = await api.post('/workspaces', { name });
    if (scope.current.userId !== userId) throw new Error('The signed-in account changed; reload its workspaces.');
    setWorkspaces(previous => [...previous, response.data]); changeWorkspace(response.data);
    return response.data;
  };
  const createProject = async (name, language = 'javascript', generateWithAI = false, initialFileName = '') => {
    if (!activeWorkspace) throw new Error('No active workspace.');
    const response = await api.post(`/projects/${activeWorkspace.id}`, { name, language, generateWithAI, initialFileName });
    if (scope.current.userId !== userId || scope.current.workspaceId !== activeWorkspace.id) throw new Error('The active account or workspace changed; reload its projects.');
    setProjects(previous => [...previous, response.data]); setActiveProject(response.data);
    return response.data;
  };
  return <WorkspaceContext.Provider value={{ workspaces, activeWorkspace, projects, activeProject, setActiveProject, loading, error, changeWorkspace, createWorkspace, createProject, refreshProjects: () => activeWorkspace && fetchProjects(activeWorkspace.id) }}>{children}</WorkspaceContext.Provider>;
};
