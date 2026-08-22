
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App.tsx'
import './index.css'
import { registerOfflineSync } from './lib/offlineSync'
// NFR-009 : initialise i18next avant le premier rendu — voir src/i18n/config.ts
import './i18n/config'

// PRS-003 : app installable + shell disponible hors ligne (service worker
// généré par vite-plugin-pwa, cf. vite.config.ts). `registerOfflineSync`
// rejoue la file d'appel prise hors ligne dès que le réseau revient.
registerSW({ immediate: true });
registerOfflineSync();

createRoot(document.getElementById("root")!).render(<App />);
