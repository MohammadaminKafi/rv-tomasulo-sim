import { defineConfig } from 'vite';

export default defineConfig({
  base: '/rv-tomasulo-sim/',
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
  },
});
