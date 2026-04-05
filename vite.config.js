import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'src',
  // './' → Electron loads index.html from the filesystem (localfile://)
  // '/' → Cloud server deployment; absolute paths needed for SPA routing
  base: process.env.VITE_BASE_URL ?? './',
  plugins: [react()],
  server: {
    port: 5000,
    host: '0.0.0.0',
    open: false,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
      '/mobile': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: '../dist-web',
    emptyOutDir: true,
  },
});
