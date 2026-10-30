import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    define: {
      'import.meta.env.VITE_COMMIT_SHA': JSON.stringify(process.env.VERCEL_GIT_COMMIT_SHA || env.VITE_COMMIT_SHA || ''),
      'process.env.VITE_SENTRY_DSN': JSON.stringify(process.env.VITE_SENTRY_DSN || env.VITE_SENTRY_DSN || ''),
      'process.env.VITE_COMMIT_SHA': JSON.stringify(process.env.VERCEL_GIT_COMMIT_SHA || env.VITE_COMMIT_SHA || ''),
    },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: true,
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'credentialless',
      },
    },
  };
});

