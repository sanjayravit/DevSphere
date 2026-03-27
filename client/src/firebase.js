import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, GithubAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Static references for Vite build-time replacement
const getVal = (viteKey, reactAppKey) => {
    return import.meta.env[viteKey] ||
        import.meta.env[reactAppKey] ||
        (typeof process !== 'undefined' && process.env ? (process.env[viteKey] || process.env[reactAppKey]) : undefined);
};

const firebaseConfig = {
    apiKey: getVal('VITE_FIREBASE_API_KEY', 'REACT_APP_FIREBASE_API_KEY'),
    authDomain: getVal('VITE_FIREBASE_AUTH_DOMAIN', 'REACT_APP_FIREBASE_AUTH_DOMAIN'),
    projectId: getVal('VITE_FIREBASE_PROJECT_ID', 'REACT_APP_FIREBASE_PROJECT_ID'),
    storageBucket: getVal('VITE_FIREBASE_STORAGE_BUCKET', 'REACT_APP_FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: getVal('VITE_FIREBASE_MESSAGING_SENDER_ID', 'REACT_APP_FIREBASE_MESSAGING_SENDER_ID'),
    appId: getVal('VITE_FIREBASE_APP_ID', 'REACT_APP_FIREBASE_APP_ID')
};

if (!firebaseConfig.apiKey) {
    console.warn("DEBUG: Firebase API Key missing. Available Env Keys:", Object.keys(import.meta.env).filter(k => k.includes('FIREBASE')));
}

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
export const githubProvider = new GithubAuthProvider();

export default app;
