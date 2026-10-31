import axios from 'axios';

const getBaseURL = () => {
    // A public API origin may point at the persistent backend; otherwise use Vercel's same-origin adapter.
    if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL.replace(/\/$/, '');
    // Same-origin browser requests are proxied by Vite locally and by the deployment adapter in production.
    return "/api";
};

const api = axios.create({
    baseURL: getBaseURL(),
    withCredentials: true,
    timeout: 240_000,
});

api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token && !config.headers.Authorization) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

export default api;
