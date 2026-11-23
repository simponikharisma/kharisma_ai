import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    define: {
      __APP_BUILD_ID__: JSON.stringify(Date.now().toString()),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      allowedHosts: ['server-rizquna.tailb3909d.ts.net', '.ts.net'],
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Ignore public assets: locked files there (e.g. logo.ico in use) crash the Vite watcher with EBUSY.
      watch: process.env.DISABLE_HMR === 'true' ? null : { ignored: ['**/public/**'] },
    },
  };
});
