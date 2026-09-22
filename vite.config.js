import { defineConfig } from 'vite';

export default defineConfig({
  base: '/dex',
  publicDir: 'public',
  build: { target: 'es2020' },
  server: {
    strictPort: true,
    headers: { 'Cache-Control': 'no-store' },
  },
});
