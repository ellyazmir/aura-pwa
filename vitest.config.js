import { defineConfig } from 'vitest/config'

// Vitest configuration kept separate from vite.config.js so the
// vite-plugin-pwa (Workbox) setup is never pulled into the test run.
export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.{test,spec}.{js,mjs}'],
  },
})
