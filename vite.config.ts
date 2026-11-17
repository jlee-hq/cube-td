import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  base: './',
  server: { port: 5199, strictPort: true },
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        vanilla: resolve(import.meta.dirname, 'vanilla.html'),
        phaser: resolve(import.meta.dirname, 'phaser.html'),
      },
    },
  },
});
