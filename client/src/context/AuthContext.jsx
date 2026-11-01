import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import api from '../services/api';
import { errorMessage } from '../utils/errorMessage';
import { auth, googleProvider, githubProvider, firebaseConfigurationError } from '../firebase';
import { signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onIdTokenChanged, fetchSignInMethodsForEmail, linkWithCredential, GithubAuthProvider, updateProfile } from 'firebase/auth';

const AuthContext = createContext();
export const useAuth = () => useContext(AuthContext);
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(firebaseConfigurationError || '');
  const version = useRef(0);
  const syncs = useRef(new Map());
  const activeAction = useRef(null);
  const sessionSource = useRef(null);
  const currentToken = useRef(null);
  const setSession = useCallback((sessionUser, sessionToken, { persist = true } = {}) => {
    currentToken.current = sessionToken; setUser(sessionUser); setToken(sessionToken);
    if (persist) { if (sessionToken) localStorage.setItem('token', sessionToken); else localStorage.removeItem('token'); }
    window.dispatchEvent(new Event('devsphere:session'));
  }, []);
  const syncUser = useCallback(async (fbUser, name, generation = version.current) => {
    const idToken = await fbUser.getIdToken();
    const key = `${generation}:${idToken}:${name || ''}`;
    if (!syncs.current.has(key)) {
      const promise = api.post('/auth/user', { idToken, ...(name ? { name } : {}) });
      syncs.current.set(key, promise);
      promise.finally(() => syncs.current.delete(key)).catch(() => {});
    }
    const response = await syncs.current.get(key);
    if (version.current !== generation || auth?.currentUser?.uid !== fbUser.uid) throw new Error('The sign-in session changed; try again.');
    if (!response.data?.token || !response.data.user?.id) throw new Error('The backend returned an invalid session.');
    sessionSource.current = 'firebase'; setSession(response.data.user, response.data.token); setAuthError('');
    return response.data;
  }, [setSession]);
  const validateBackendToken = useCallback(async (candidate, generation = version.current) => {
    if (typeof candidate !== 'string' || !candidate || candidate.length > 8_192) throw new Error('Invalid session.');
    const response = await api.get('/auth/me', { headers: { Authorization: `Bearer ${candidate}` } });
    if (generation !== version.current || !response.data?.id) throw new Error('Invalid or changed session.');
    sessionSource.current = 'backend'; setSession(response.data, candidate); setAuthError('');
    return response.data;
  }, [setSession]);
  useEffect(() => {
    let mounted = true;
    let first = true;
    const observe = async fbUser => {
      const initial = first; first = false;
      // Explicit login/register/logout owns its synchronization. Firebase can
      // emit before or after its promise resolves; it must not invalidate that
      // same action or race an unnamed registration request against profile sync.
      if (activeAction.current || ['backend', 'logged-out'].includes(sessionSource.current)) return;
      version.current += 1;
      const generation = version.current;
      try {
        if (initial && localStorage.getItem('token')) await validateBackendToken(localStorage.getItem('token'), generation);
        else if (fbUser) await syncUser(fbUser, undefined, generation);
        else setSession(null, null);
      } catch (error) {
        if (mounted && generation === version.current) {
          setSession(null, null);
          setAuthError(errorMessage(error, 'Sign-in synchronization failed.'));
        }
      } finally { if (mounted && generation === version.current) setLoading(false); }
    };
    const unsubscribe = auth ? onIdTokenChanged(auth, observe) : (observe(null), () => {});
    return () => { mounted = false; version.current += 1; unsubscribe(); };
  }, [validateBackendToken, setSession, syncUser]);
  // localStorage is shared across tabs. API requests and the rendered account
  // must never silently use different identities after another tab signs in/out.
  useEffect(() => {
    const changed = async event => {
      if (event.key !== 'token' && event.key !== null) return;
      const candidate = localStorage.getItem('token');
      if (candidate === currentToken.current) return;
      const generation = ++version.current;
      const operation = Symbol('external-session'); activeAction.current = operation;
      sessionSource.current = 'logged-out'; syncs.current.clear(); setSession(null, null, { persist: false }); setLoading(true);
      try { if (candidate) await validateBackendToken(candidate, generation); }
      catch (error) {
        if (generation === version.current) { setSession(null, null); setAuthError(errorMessage(error, 'The session in another tab is invalid.')); }
      } finally {
        if (generation === version.current) setLoading(false);
        if (activeAction.current === operation) activeAction.current = null;
      }
    };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, [setSession, validateBackendToken]);
  const requireAuth = () => { if (!auth) throw new Error(firebaseConfigurationError || 'Firebase sign-in is unavailable.'); };
  const firebaseAction = async work => {
    requireAuth();
    const generation = ++version.current;
    const operation = Symbol('firebase-session'); activeAction.current = operation;
    sessionSource.current = 'firebase'; syncs.current.clear(); setSession(null, null);
    try {
      const { fbUser, name } = await work();
      if (generation !== version.current) throw new Error('The sign-in session changed; try again.');
      return await syncUser(fbUser, name, generation);
    } catch (error) {
      if (generation === version.current) {
        sessionSource.current = 'logged-out'; setSession(null, null); setAuthError(errorMessage(error, 'Sign-in synchronization failed.'));
        if (auth.currentUser) await signOut(auth).catch(() => {});
      }
      throw error;
    } finally { if (activeAction.current === operation) activeAction.current = null; }
  };
  const login = (email, password) => firebaseAction(async () => ({ fbUser: (await signInWithEmailAndPassword(auth, email, password)).user }));
  const loginWithGoogle = () => firebaseAction(async () => ({ fbUser: (await signInWithPopup(auth, googleProvider)).user }));
  const loginWithGithub = () => firebaseAction(async () => {
    try { return { fbUser: (await signInWithPopup(auth, githubProvider)).user }; }
    catch (error) {
      if (error.code !== 'auth/account-exists-with-different-credential') throw error;
      const email = error.customData?.email;
      const pending = GithubAuthProvider.credentialFromError(error);
      if (!email || !pending || !(await fetchSignInMethodsForEmail(auth, email)).includes('google.com')) throw error;
      const result = await signInWithPopup(auth, googleProvider);
      if (result.user.email?.toLowerCase() !== email.toLowerCase()) throw new Error('Sign in with the account that owns this email before linking GitHub.');
      await linkWithCredential(result.user, pending);
      return { fbUser: result.user };
    }
  });
  const register = (name, email, password) => firebaseAction(async () => {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(result.user, { displayName: name });
    return { fbUser: result.user, name };
  });
  const acceptBackendToken = useCallback(async candidate => {
    const generation = ++version.current;
    const operation = Symbol('backend-session'); activeAction.current = operation;
    sessionSource.current = 'logged-out'; syncs.current.clear(); setSession(null, null);
    try {
      // Do not let a later Firebase token refresh overwrite an OAuth account.
      if (auth?.currentUser) await signOut(auth);
      return await validateBackendToken(candidate, generation);
    } catch (error) {
      if (generation === version.current) { setSession(null, null); setAuthError(errorMessage(error, 'Sign-in synchronization failed.')); }
      throw error;
    } finally { if (activeAction.current === operation) activeAction.current = null; }
  }, [setSession, validateBackendToken]);
  const logout = async () => {
    version.current += 1; sessionSource.current = 'logged-out'; syncs.current.clear(); setSession(null, null);
    const operation = Symbol('logout'); activeAction.current = operation;
    try { if (auth) await signOut(auth); }
    finally { if (activeAction.current === operation) activeAction.current = null; }
  };
  return <AuthContext.Provider value={{ user, token, authError, loading, login, register, logout, loginWithGoogle, loginWithGithub, acceptBackendToken }}>{!loading && children}</AuthContext.Provider>;
};
