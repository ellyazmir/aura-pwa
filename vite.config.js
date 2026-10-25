import { defineConfig, loadEnv } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Roboflow EasyOCR serverless workflow endpoint. The dev-server proxy forwards
// POSTs from `/api/ocr` here as a path-rewriting pass-through. Authentication is
// done with `api_key` inside the JSON request body (not a Bearer header).
const ROBOFLOW_ENDPOINT =
  'https://serverless.roboflow.com/yaps-workspace-h9tsc/workflows/easyocr-demo'

export default defineConfig(({ mode }) => {
  // Load .env so we can read ROBOFLOW_API_KEY. The empty prefix ('') exposes all
  // vars to this config file only.
  const env = loadEnv(mode, process.cwd(), '')
  const roboflowKey = env.ROBOFLOW_API_KEY ?? ''

  return {
    // Expose the Roboflow key to client code as a build-time constant so
    // fetchOCR.js can send it in the request body. NOTE: embedding the key in
    // the client bundle is acceptable only for this prototype — for production
    // this must move server-side (e.g. a proxy/function that holds the secret).
    define: {
      __ROBOFLOW_API_KEY__: JSON.stringify(roboflowKey)
    },
    plugins: [
      VitePWA({
        // Background download of the new service worker; the user-facing update
        // banner is wired up in task 11.2 via the registration callback.
        registerType: 'autoUpdate',
        manifest: {
          name: 'Aura',
          short_name: 'Aura',
          description: 'Offline AI Tutor',
          theme_color: '#6C3FC5',
          background_color: '#ffffff',
          display: 'standalone',
          start_url: '/',
          icons: [
            { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png' }
          ]
        },
        workbox: {
          // Precache the app shell, static assets, and translation JSON
          // (cache-first). Exclude the large WebLLM worker/model — it is far too
          // big to precache and is handled by runtime caching instead.
          globPatterns: ['**/*.{js,css,html,json,png,svg,webmanifest}'],
          // The WebLLM worker chunk bundles the web-llm engine and is far
          // larger than any app chunk (several MB). It is loaded on demand at
          // interaction time and its model shards are runtime-cached from the
          // CDN, so it is deliberately kept out of the precache manifest.
          globIgnores: ['**/tutorWorker-*.js'],
          // 4 MB ceiling: large enough for app chunks + translations, small
          // enough to keep the multi-hundred-MB WebLLM model shards out of the
          // precache manifest (they are runtime-cached from the CDN).
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
          navigateFallback: '/index.html',
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          runtimeCaching: [
            {
              // Network-first for the OCR API so the freshest result wins when
              // online, with a 15 s ceiling matching the OCRService timeout.
              // Matches both the direct Roboflow host and the dev-server proxy path.
              urlPattern: ({ url }) =>
                url.hostname === 'serverless.roboflow.com' ||
                url.pathname.startsWith('/api/ocr'),
              handler: 'NetworkFirst',
              options: {
                cacheName: 'ocr-api-cache',
                networkTimeoutSeconds: 15,
                cacheableResponse: { statuses: [0, 200] }
              }
            },
            {
              // Cache-first for WebLLM model shards and wasm libs. Weights are
              // served from huggingface.co; the model wasm libraries from the
              // mlc-ai binary repo (raw.githubusercontent) / jsdelivr mirror.
              // Opaque (0) responses are allowed since CDN fetches are cross-origin.
              urlPattern: ({ url }) =>
                url.hostname === 'huggingface.co' ||
                url.hostname === 'cdn-lfs.huggingface.co' ||
                url.hostname === 'raw.githubusercontent.com' ||
                (url.hostname === 'cdn.jsdelivr.net' &&
                  /mlc|web-llm|wasm/.test(url.pathname)),
              handler: 'CacheFirst',
              options: {
                cacheName: 'model-cache',
                expiration: { maxEntries: 200 },
                cacheableResponse: { statuses: [0, 200] }
              }
            }
          ]
        }
      })
    ],
    server: {
      host: true,
      allowedHosts: true,
      proxy: {
        // Dev-server proxy: `/api/ocr` -> Roboflow workflow endpoint.
        // Path-rewriting pass-through only. Authentication is handled via the
        // `api_key` field in the request body (set by the client), so no
        // Authorization header is injected here.
        '/api/ocr': {
          target: 'https://serverless.roboflow.com',
          changeOrigin: true,
          secure: true,
          rewrite: () =>
            '/yaps-workspace-h9tsc/workflows/easyocr-demo'
        }
      }
    }
  }
})

// Direct endpoint retained for reference / production wiring.
export { ROBOFLOW_ENDPOINT }
