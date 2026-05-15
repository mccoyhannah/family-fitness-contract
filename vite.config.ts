import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'app-icon.svg'],
      manifest: {
        name: '家庭健身契约',
        short_name: '健身契约',
        description: '家庭内训练计划、请假、云同步打卡和罚款账本。',
        theme_color: '#ff6a2a',
        background_color: '#120f0d',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/app-icon.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: '/app-icon.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
      },
    }),
  ],
})
