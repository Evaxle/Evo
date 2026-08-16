import { defineConfig } from 'vite';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { opencodePlugin } from './opencode-plugin';

const dir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: dir,
  plugins: [opencodePlugin()],
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true,
    target: 'es2020',
    chunkSizeWarningLimit: 4000,
  },
  server: {
    port: 3000,
    host: true,
  },
  worker: {
    format: 'es',
  },
});
