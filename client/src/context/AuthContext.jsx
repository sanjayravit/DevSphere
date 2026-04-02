import React, { createContext, useContext, useState, useEffect } from 'react';
import { jwtDecode } from 'jwt-decode';
import api from '../services/api';
import { auth, googleProvider, githubProvider } from '../firebase';
import {
    signInWithPopup,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    fetchSignInMethodsForEmail,
    linkWithCredential,
    GithubAuthProvider
} from 'firebase/auth';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
            if (fbUser) {
                const idToken = await fbUser.getIdToken();
                try {
                    const res = await api.post('/auth/user', { idToken });
                    localStorage.setItem('token', res.data.token);
                    setUser(res.data.user);
                } catch (err) {
                    console.error("Firebase sync error", err);
                    setUser(fbUser); // Fallback
                }
            } else {
                setUser(null);
                localStorage.removeItem('token');
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const login = async (email, password) => {
        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const idToken = await userCredential.user.getIdToken();
            const res = await api.post('/auth/user', { idToken });
            localStorage.setItem('token', res.data.token);
            setUser(res.data.user);
            return res.data;
        } catch (err) {
            console.error("Login error", err);
            throw err;
        }
    };

    const loginWithGoogle = async () => {
        try {
            const result = await signInWithPopup(auth, googleProvider);
            const idToken = await result.user.getIdToken();
            const res = await api.post('/auth/user', { idToken });
            localStorage.setItem('token', res.data.token);
            setUser(res.data.user);
            return res.data;
        } catch (err) {
            console.error("Google Login error", err);
            throw err;
        }
    };

    const handleAccountLinkingError = async (err) => {
        if (err.code === 'auth/account-exists-with-different-credential') {
            const email = err.customData?.email;
            const pendingCredential = GithubAuthProvider.credentialFromError(err);
            if (!email || !pendingCredential) throw err;

            const methods = await fetchSignInMethodsForEmail(auth, email);

            if (methods.includes('google.com')) {
                const result = await signInWithPopup(auth, googleProvider);
                await linkWithCredential(result.user, pendingCredential);
                const idToken = await result.user.getIdToken();
                const res = await api.post('/auth/user', { idToken });
                localStorage.setItem('token', res.data.token);
                setUser(res.data.user);
                return res.data;
            }
        }
        throw err;
    };

    const loginWithGithub = async () => {
        try {
            const result = await signInWithPopup(auth, githubProvider);
            const idToken = await result.user.getIdToken();
            const res = await api.post('/auth/user', { idToken });
            localStorage.setItem('token', res.data.token);
            setUser(res.data.user);
            return res.data;
        } catch (err) {
            if (err.code === 'auth/account-exists-with-different-credential') {
                return await handleAccountLinkingError(err);
            }
            console.error("Github Login error", err);
            throw err;
        }
    };

    const register = async (name, email, password) => {
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const idToken = await userCredential.user.getIdToken();
            const res = await api.post('/auth/user', { idToken, name });
            localStorage.setItem('token', res.data.token);
            setUser(res.data.user);
            return res.data;
        } catch (err) {
            console.error("Register error", err);
            throw err;
        }
    };

    const logout = () => signOut(auth);

    return (
        <AuthContext.Provider value={{
            user,
            login,
            register,
            logout,
            loginWithGoogle,
            loginWithGithub,
            loading
        }}>
            {!loading && children}
        </AuthContext.Provider>
    );
};
