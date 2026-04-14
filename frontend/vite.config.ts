import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/** Dev-only: same-origin API calls via Vite → FastAPI (avoids flaky localhost:8000 from the browser). */
const API_DEV_TARGET = 'http://127.0.0.1:8000';
const API_PROXY_PREFIXES = [
  '/auth',
  '/teachers',
  '/classes',
  '/lessons',
  '/my',
  '/class',
  '/calendar',
  '/weeks',
  '/current-month-week',
  '/health',
  '/upload',
] as const;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@api': path.resolve(__dirname, 'src/api'),
      '@components': path.resolve(__dirname, 'src/components'),
      '@lib': path.resolve(__dirname, 'src/lib'),
      '@views': path.resolve(__dirname, 'src/views'),
    },
  },
  server: {
    port: 5173,
    open: true,
    host: true, // Allow external connections
    allowedHosts: [
      'localhost',
      '127.0.0.1',
      '.loca.lt', // Allow all localtunnel subdomains
      'e-home-frontend.loca.lt', // Specific subdomain
    ],
    proxy: Object.fromEntries(
      API_PROXY_PREFIXES.map((p) => [p, { target: API_DEV_TARGET, changeOrigin: true }]),
    ),
  },
});



