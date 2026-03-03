import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  // index.html lives at the project root (frontend/)
  root: '.',
  publicDir: 'public',

  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },

  server: {
    port: 3000,
    host: true,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      },
      '/tiles': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/tiles/, '/maps'),
      },
      '/titiler': {
        target: 'http://localhost:8083',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/titiler/, ''),
      },
    },
  },

  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          maplibre:  ['maplibre-gl'],
          chartjs:   ['chart.js'],
        },
      },
    },
  },

  preview: {
    port: 3000,
    host: true,
  },
});
