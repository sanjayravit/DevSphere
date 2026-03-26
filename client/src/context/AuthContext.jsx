import { jwtDecode } from 'jwt-decode';
import { auth, googleProvider, githubProvider } from '../firebase';
import {
    signInWithPopup,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    onAuthStateChanged
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
                    const res = await api.post('/auth/firebase-sync', { idToken });
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
            const res = await api.post('/auth/firebase-sync', { idToken });
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
            const res = await api.post('/auth/firebase-sync', { idToken });
            localStorage.setItem('token', res.data.token);
            setUser(res.data.user);
            return res.data;
        } catch (err) {
            console.error("Google Login error", err);
            throw err;
        }
    };

    const loginWithGithub = async () => {
        try {
            const result = await signInWithPopup(auth, githubProvider);
            const idToken = await result.user.getIdToken();
            const res = await api.post('/auth/firebase-sync', { idToken });
            localStorage.setItem('token', res.data.token);
            setUser(res.data.user);
            return res.data;
        } catch (err) {
            console.error("Github Login error", err);
            throw err;
        }
    };

    const register = async (name, email, password) => {
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const idToken = await userCredential.user.getIdToken();
            const res = await api.post('/auth/firebase-sync', { idToken, name });
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
