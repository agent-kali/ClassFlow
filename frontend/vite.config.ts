import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
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
  },
});



