import axios from 'axios';

const getBaseURL = () => {
    if (process.env.NODE_ENV === 'production') {
        return process.env.REACT_APP_API_URL || "/api";
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
