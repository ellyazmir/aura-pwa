// vite.config.ts
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => ({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Aura Tutor',
        short_name: 'Aura Tutor',
        display: 'standalone',
        start_url: '/',
        background_color: '#f8fafc',
        theme_color: '#2563eb',
        icons: [], // add 192/512 png icons later to make it installable
      },
      workbox: {
        // wllama wasm files are several MB; the default 2 MiB limit would silently skip them
        maximumFileSizeToCacheInBytes: 40 * 1024 * 1024,
        globPatterns: ['**/*.{js,mjs,css,html,wasm,svg,png,ico}'],
        navigateFallbackDenylist: [/^\/api\//], // never serve index.html for API calls
      },
    }),
  ],
  optimizeDeps: { exclude: ['@wllama/wllama'] },
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
  build: {
    assetsInlineLimit: (file: string) => (file.endsWith('.mjs') ? false : undefined),
  },
  server: {
    hmr: process.env.DISABLE_HMR !== 'true',
    watch: process.env.DISABLE_HMR === 'true' ? null : {},
  },
}));