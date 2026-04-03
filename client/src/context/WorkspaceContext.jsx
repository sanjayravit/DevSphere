import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from './AuthContext';

const WorkspaceContext = createContext();

export const useWorkspace = () => useContext(WorkspaceContext);

export const WorkspaceProvider = ({ children }) => {
    const { user } = useAuth();
    const [workspaces, setWorkspaces] = useState([]);
    const [activeWorkspace, setActiveWorkspace] = useState(null);
    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (user) {
            fetchWorkspaces();
        } else {
            setWorkspaces([]);
            setActiveWorkspace(null);
            setProjects([]);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]);

    const fetchWorkspaces = async () => {
        try {
            setLoading(true);
            const res = await api.get('/workspaces');
            setWorkspaces(res.data);
            if (res.data.length > 0) {
                // Determine user memory or default to first workspace
                const savedId = localStorage.getItem('devsphere-active-workspace');
                const target = savedId ? res.data.find(w => w.id === savedId) || res.data[0] : res.data[0];
                setActiveWorkspace(target);
                await fetchProjects(target.id);
            } else {
                setLoading(false);
            }
        } catch (err) {
            console.error("Error fetching workspaces:", err);
            setLoading(false);
        }
    };

    const fetchProjects = async (workspaceId) => {
        try {
            const res = await api.get(`/projects/workspace/${workspaceId}`);
            setProjects(res.data);
        } catch (err) {
            console.error("Error fetching projects:", err);
        } finally {
            setLoading(false);
        }
    };

    const changeWorkspace = (workspace) => {
        setActiveWorkspace(workspace);
        localStorage.setItem('devsphere-active-workspace', workspace.id);
        fetchProjects(workspace.id);
    };

    const createWorkspace = async (name) => {
        try {
            const res = await api.post('/workspaces', { name });
            if (res.data && !res.data.error) {
                setWorkspaces([...workspaces, res.data]);
                changeWorkspace(res.data);
                return res.data;
            }
        } catch (err) {
            console.error("Create workspace error:", err);
            throw err;
        }
    };

    const createProject = async (name, language = 'javascript', generateWithAI = false, initialFileName = '') => {
        if (!activeWorkspace) throw new Error("No active workspace");
        try {
            const res = await api.post(`/projects/${activeWorkspace.id}`, { name, language, generateWithAI, initialFileName });
            if (res.data && !res.data.error) {
                setProjects([...projects, res.data]);
                return res.data;
            } else {
                throw new Error(res.data?.error || "Failed to create project");
            }
        } catch (err) {
            console.error("Create project API error:", err);
            throw err;
        }
    };

    return (
        <WorkspaceContext.Provider value={{
            workspaces,
            activeWorkspace,
            projects,
            loading,
            changeWorkspace,
            createWorkspace,
            createProject,
            refreshProjects: () => activeWorkspace && fetchProjects(activeWorkspace.id)
        }}>
            {children}
        </WorkspaceContext.Provider>
    );
};
