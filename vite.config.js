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
      // Mode injectManifest : on fournit notre propre SW (src/sw.js) pour
      // pouvoir y brancher les handlers push + notificationclick (Étape 4
      // mobile). Le runtime caching et le precaching sont assurés par
      // workbox côté SW, comme avec generateSW.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,ico,woff2}'],
        // Le bundle index dépasse le default 2 MiB depuis l'ajout
        // progressif des modules mobile (Mode Chantier, MobileHome,
        // MobileChantiersList). On accepte 5 MiB de précache par
        // fichier — c'est cohérent avec une PWA qui embarque PDF,
        // Whisper client, et html2canvas dans le bundle principal.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      includeAssets: ['icon-512.png'],
      manifest: {
        name: 'ArchiPilot',
        short_name: 'ArchiPilot',
        description: 'Copilote IA pour architectes — gestion de chantier et génération de PV',
        lang: 'fr',
        theme_color: '#C05A2C',
        background_color: '#FAFAF8',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        scope: '/',
        categories: ['business', 'productivity'],
        icons: [
          {
            src: 'icon-512.png',
            sizes: 'any',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icon-512.png',
            sizes: 'any',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
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
