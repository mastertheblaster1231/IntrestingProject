import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        ocean: resolve(import.meta.dirname, 'ocean.html'),
      },
    },
  },
  server: {
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
