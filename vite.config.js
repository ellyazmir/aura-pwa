import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Aura',
        short_name: 'Aura',
        description: 'Offline Math Solver',
        theme_color: '#6C3FC5',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/'
      }
    })
  ],
  server: {
    host: true,
    allowedHosts: true
  }
})