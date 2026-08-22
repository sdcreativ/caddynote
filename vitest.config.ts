import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

// Suite de tests frontend — jusqu'ici absente (le job CI `build_and_test`
// échouait sur `npm test`, faute de script configuré). Même alias `@` que
// vite.config.ts, volontairement dans un fichier séparé pour ne pas risquer
// de casser la config de build/dev existante.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test/setup.ts'],
    // `server/` a sa propre suite (server/vitest.config.ts, base Postgres
    // dédiée) : sans cette restriction, vitest ramasse aussi
    // `server/src/__tests__/**` depuis la racine et tente de joindre la base
    // via le `.env` racine (Docker), pas `server/.env`.
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['server/**', 'node_modules/**'],
  },
});
