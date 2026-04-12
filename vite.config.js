import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-512.svg'],
      manifest: {
        name: 'ArchiPilot',
        short_name: 'ArchiPilot',
        description: 'Copilote IA pour architectes — gestion de chantier et génération de PV',
        lang: 'fr',
        theme_color: '#D97B0D',
        background_color: '#FAFAF9',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        scope: '/',
        categories: ['business', 'productivity'],
        icons: [
          {
            src: 'icon-512.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: 'icon-512.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Précache tous les assets statiques de l'app shell
        globPatterns: ['**/*.{js,css,html,svg,ico,woff2}'],
        // Stratégie : Network-first pour les navigations, Cache-first pour les assets
        runtimeCaching: [
          {
            // Assets JS/CSS déjà précachés — Cache-first
            urlPattern: /\.(?:js|css)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'static-assets',
              expiration: { maxEntries: 60, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
          {
            // Images — Cache-first, longue durée
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images',
              expiration: { maxEntries: 100, maxAgeSeconds: 90 * 24 * 60 * 60 },
            },
          },
        ],
        // Garder les PV et notes accessibles offline via les données en cache
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api/],
        cleanupOutdatedCaches: true,
      },
      devOptions: {
        // Désactiver le SW en dev (évite les conflits HMR)
        enabled: false,
      },
    }),
  ],
  server: {
    port: 3000,
    open: true,
  },
})
