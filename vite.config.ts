import react from '@vitejs/plugin-react'
import legacy from '@vitejs/plugin-legacy'
import { defineConfig } from 'vite'

// Tizen 5.5+ (2020+ TVs) ships Chromium 69-76; the app loads from file:// inside the .wgt,
// so legacy chunks and polyfills are needed for older Web Runtime engines.
export default defineConfig({
  plugins: [
    react(),
    legacy({
      targets: ['chrome >= 69'],
      additionalLegacyPolyfills: ['regenerator-runtime/runtime'],
    }),
  ],
  base: './',
  build: {
    target: 'chrome69',
    outDir: 'dist',
    assetsInlineLimit: 0,
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/ccloud-api': {
        target: 'https://server-hi-speed-iran.info/api',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/ccloud-api/, ''),
      },
      '/ccloud-helper-1': {
        target: 'https://hostinnegar.com/api',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/ccloud-helper-1/, ''),
      },
      '/ccloud-helper-2': {
        target: 'https://windowsdiba.info/api',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/ccloud-helper-2/, ''),
      },
    },
  },
})
