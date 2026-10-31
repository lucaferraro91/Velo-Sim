/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// base './' damit die gebaute App auch in einem Unterordner läuft (z.B. GitHub Pages /velo-sim/)
export default defineConfig({
  base: './',
  build: {
    // Three.js und Leaflet als eigene Dateien: ändern sich selten und bleiben im Cache
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'three', test: /node_modules[\\/]three[\\/]/ },
            { name: 'leaflet', test: /node_modules[\\/]leaflet[\\/]/ }
          ]
        }
      }
    },
    chunkSizeWarningLimit: 700
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Velo-Sim',
        short_name: 'Velo-Sim',
        description: 'Indoor-Velotraining: GPX-Strecken in einer erzeugten 3D-Welt, Smart Trainer steuern, Workouts erstellen.',
        lang: 'de-CH',
        theme_color: '#17222c',
        background_color: '#17222c',
        display: 'standalone',
        orientation: 'landscape',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // Schriften und Kartenkacheln beim Benutzen zwischenspeichern
        runtimeCaching: [
          { urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//, handler: 'StaleWhileRevalidate',
            options: { cacheName: 'schriften', expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 } } },
          { urlPattern: /^https:\/\/server\.arcgisonline\.com\//, handler: 'CacheFirst',
            options: { cacheName: 'kartenkacheln', expiration: { maxEntries: 2000, maxAgeSeconds: 60 * 60 * 24 * 30 } } }
        ]
      }
    })
  ],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts']
  }
});
