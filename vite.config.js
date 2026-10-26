import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset URLs work on both a GitHub Pages project path and a custom domain.
  base: './',
  server: { allowedHosts: true },
  preview: { allowedHosts: true },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    chunkSizeWarningLimit: 650,
  },
});
