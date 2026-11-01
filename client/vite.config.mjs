import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import envCompatible from 'vite-plugin-env-compatible';
import svgr from 'vite-plugin-svgr';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const directory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    plugins: [
        react(),
        envCompatible({ prefix: 'REACT_APP_' }),
        svgr()
    ],
    resolve: {
        alias: {
            '@': path.resolve(directory, './src'),
        },
    },
    server: {
        host: '0.0.0.0',
        allowedHosts: ['localhost', '.localhost', '.e2b.app'],
        port: 3000,
        open: false,
        proxy: {
            '/api': {
                target: 'http://localhost:5050',
                changeOrigin: true,
                secure: false,
            },
            '/socket.io': {
                target: 'http://localhost:5050',
                ws: true,
            },
        },
    },
    build: {
        outDir: 'build',
        sourcemap: false,
    }
});
