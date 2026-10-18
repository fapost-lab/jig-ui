import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

// The page is built into dist/web, which the server serves; the package ships it already built.
export default defineConfig({
  root: 'web',
  plugins: [vue(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./web', import.meta.url)) } },
  build: { outDir: '../dist/web', emptyOutDir: true },
});
