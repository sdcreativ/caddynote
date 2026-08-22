import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";
import browserslistToEsbuild from "browserslist-to-esbuild";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === 'development' &&
    componentTagger(),
    // PRS-003 : app installable + shell disponible hors ligne (précache
    // automatique des assets buildés — JS/CSS/HTML/icônes). La donnée
    // dynamique (liste de classe, saisies d'appel) est gérée séparément par
    // la file d'attente IndexedDB (`src/lib/offlineDb.ts`), pas par le cache
    // du service worker — plus fiable et inspectable pour des écritures qui
    // doivent être synchronisées sans doublon.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'favicon-16x16.png', 'favicon-32x32.png', 'apple-touch-icon.png', 'logo-cn.png', 'logo-cn-light.png'],
      manifest: {
        name: 'CaddyNote',
        short_name: 'CaddyNote',
        description: "Gestion scolaire pour établissements : présences, notes, paiements Mobile Money et familles connectées",
        lang: 'fr',
        theme_color: '#1D70D8',
        background_color: '#0B1F3A',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Ne précache que le shell applicatif buildé — jamais les réponses
        // d'API (données sensibles/multi-tenant), volontairement absentes
        // de ce périmètre (cf. commentaire ci-dessus).
        globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg,jpeg,woff2}'],
        // Bundle principal > 2 MiB : on relève le plafond pour permettre le précache PWA.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ].filter(Boolean),
  build: {
    // NFR-007 : transpile selon browserslist (Chrome/Firefox/Safari/Android).
    target: browserslistToEsbuild(),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
