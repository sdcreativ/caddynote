#!/usr/bin/env node
/**
 * Smoke PWA post-build (PRS-003) — vérifie les artefacts installables
 * sans device réel. La validation terrain reste dans docs/PWA_RECETTE.md.
 *
 * Usage : npm run build && npm run pwa:smoke
 *         (ou PWA_DIST=./dist node scripts/pwa-smoke.mjs)
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.resolve(root, process.env.PWA_DIST || 'dist');

const fail = (msg) => {
  console.error(`✗ ${msg}`);
  process.exitCode = 1;
};
const ok = (msg) => console.log(`✓ ${msg}`);

if (!existsSync(dist)) {
  fail(`Dossier ${dist} absent — lancez d’abord npm run build`);
  process.exit(1);
}

const files = readdirSync(dist);
const manifestName = files.find((f) => f.endsWith('.webmanifest') || f === 'manifest.webmanifest');
if (!manifestName) {
  fail('Aucun fichier *.webmanifest dans dist/');
} else {
  ok(`manifest : ${manifestName}`);
  try {
    const manifest = JSON.parse(readFileSync(path.join(dist, manifestName), 'utf8'));
    if (!manifest.name && !manifest.short_name) fail('manifest sans name/short_name');
    else ok(`name=${manifest.name || manifest.short_name}`);
    if (!Array.isArray(manifest.icons) || manifest.icons.length === 0) fail('manifest.icons vide');
    else ok(`${manifest.icons.length} icône(s) déclarée(s)`);
    for (const icon of manifest.icons || []) {
      const src = String(icon.src || '').replace(/^\//, '');
      const inDist = existsSync(path.join(dist, src));
      const inPublic = existsSync(path.join(root, 'public', src));
      if (!inDist && !inPublic) fail(`icône manquante : ${icon.src}`);
      else ok(`icône ok : ${icon.src}`);
    }
  } catch (e) {
    fail(`manifest JSON invalide : ${e instanceof Error ? e.message : e}`);
  }
}

const sw = files.find((f) => /^sw/.test(f) || f === 'sw.js' || f.endsWith('sw.js'));
const workbox = files.find((f) => f.startsWith('workbox-'));
if (!sw && !workbox) {
  // vite-plugin-pwa peut placer le SW à la racine ou générer registerSW
  const hasRegister = files.some((f) => f.includes('registerSW') || f.includes('workbox'));
  if (!hasRegister) fail('Aucun service worker / workbox détecté dans dist/');
  else ok('artefacts workbox/registerSW présents');
} else {
  ok(`service worker / workbox : ${sw || workbox}`);
}

for (const icon of ['pwa-192x192.png', 'pwa-512x512.png']) {
  if (existsSync(path.join(dist, icon)) || existsSync(path.join(root, 'public', icon))) ok(`asset ${icon}`);
  else fail(`asset ${icon} manquant`);
}

if (!process.exitCode) {
  console.log('\nSmoke PWA OK — valider encore sur device réel (docs/PWA_RECETTE.md).');
}
