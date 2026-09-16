import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@react-three/fiber': resolve(import.meta.dirname, 'shims/react-three-fiber.js'),
    },
    // Force a single copy of React across the entire bundle.
    // This prevents the "Cannot read properties of null (reading 'useCallback')"
    // error caused by Vite code-splitting creating separate React instances
    // in different chunks (e.g. useOceanStore chunk vs ocean chunk).
    dedupe: ['react', 'react-dom'],
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        ocean: resolve(import.meta.dirname, 'ocean.html'),
      },
      output: {
        // Force React + React-DOM into a single shared "vendor" chunk
        // so every module in the app references the exact same React instance.
        // Vite 8 (Rolldown) requires manualChunks to be a function.
        manualChunks(id) {
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) {
            return 'react-vendor';
          }
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_BACKEND_PROXY_TARGET || 'http://127.0.0.1:8000',
        changeOrigin: true,
        timeout: 35000, // public backend (was 15000)
        configure: (proxy) => {
          proxy.on('error', (err, _req, _res) => {
            console.warn('[vite proxy /api] Backend unreachable — frontend will use fallback:', err.message);
          });
        },
      },
      '/erddap-proxy': {
        target: process.env.VITE_ERDDAP_PROXY_TARGET || 'https://erddap.ifremer.fr',
        changeOrigin: true,
        secure: true,
        timeout: 35000, // public ERDDAP (was 15000)
        rewrite: (path) => path.replace(/^\/erddap-proxy/, ''),
      },
    },
    watch: {
      // Ignore watching heavy image/binary directories to avoid Windows EBUSY file locks
      ignored: [
        '**/Images/**',
        '**/3d Models/**',
        '**/dist/**',
        '**/*.jpg',
        '**/*.png',
        '**/*.jpeg',
        '**/*.glb',
        '**/*.gltf',
      ],
    },
  },
});
