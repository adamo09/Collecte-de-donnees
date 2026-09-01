import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    host: true,
    port: 5173,
    // L'API est appelée en relatif (/api/v1) : en développement le proxy
    // l'achemine, en production le serveur statique fait de même. Aucune
    // URL d'API n'est donc compilée dans le bundle.
    proxy: {
      '/api': { target: process.env.URL_API ?? 'http://localhost:8000', changeOrigin: true },
      '/sante': { target: process.env.URL_API ?? 'http://localhost:8000', changeOrigin: true },
    },
  },
  build: { outDir: 'dist', sourcemap: true },
});
