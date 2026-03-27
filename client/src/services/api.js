import axios from 'axios';

const getBaseURL = () => {
    // Force Vercel to use the relative /api path which points to the same domain's serverless functions
    if (process.env.NODE_ENV === 'production' || window.location.hostname.includes('vercel.app')) {
        return "/api";
    }
    return process.env.REACT_APP_API_URL || "http://localhost:5050/api";
};

const api = axios.create({
    baseURL: getBaseURL(),
    withCredentials: true,
});

api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

export default api;
