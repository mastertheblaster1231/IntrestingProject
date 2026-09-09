import { defineConfig } from 'vite';

export default defineConfig({
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
