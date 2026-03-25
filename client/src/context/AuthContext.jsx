import React, { createContext, useState, useEffect, useContext } from 'react';
import api from '../services/api';
import { jwtDecode } from 'jwt-decode';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadUser = async () => {
            const token = localStorage.getItem('token');
            if (token) {
                try {
                    // Verify token format
                    const decoded = jwtDecode(token);
                    // If we want to fetch the real user profile:
                    const res = await api.get('/auth/me').catch(() => null);
                    if (res && res.data) {
                        setUser(res.data);
                    } else {
                        setUser(decoded);
                    }
                } catch (err) {
                    console.error("Invalid token", err);
                    localStorage.removeItem('token');
                }
            }
            setLoading(false);
        };

        loadUser();
    }, []);

    const login = async (email, password) => {
        try {
            const res = await api.post('/auth/login', { email, password });
            localStorage.setItem('token', res.data.token);
            setUser(jwtDecode(res.data.token));
            return res.data;
        } catch (err) {
            console.error("DEBUG: Login full error:", err);
            console.log("DEBUG: Login response data:", err.response?.data);
            throw err;
        }
    };

    const setAuthToken = async (token) => {
        localStorage.setItem('token', token);
        try {
            const decoded = jwtDecode(token);
            const res = await api.get('/auth/me').catch(() => null);
            setUser(res?.data || decoded);
        } catch (err) {
            console.error("Set token error", err);
            setUser(jwtDecode(token));
        }
    };

    const register = async (name, email, password) => {
        try {
            const res = await api.post('/auth/register', { name, email, password });
            localStorage.setItem('token', res.data.token);
            setUser(jwtDecode(res.data.token));
            return res.data;
        } catch (err) {
            console.error("DEBUG: Register full error:", err);
            console.log("DEBUG: Register response data:", err.response?.data);
            throw err;
        }
    };

    const logout = () => {
        localStorage.removeItem('token');
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, login, register, logout, setAuthToken, loading }}>
            {!loading && children}
        </AuthContext.Provider>
    );
};
