#!/usr/bin/env node
/**
 * Prerender HTML complet des pages publiques (Puppeteer).
 * Les crawlers reçoivent le DOM React déjà rendu + meta Helmet.
 *
 * SKIP_PRERENDER=1 pour désactiver (CI sans Chromium, etc.)
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import { SEO_PAGES } from './seo-routes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const PORT = Number(process.env.PRERENDER_PORT || 4179);
const BASE = `http://127.0.0.1:${PORT}`;

if (process.env.SKIP_PRERENDER === '1') {
  console.log('[prerender] SKIP_PRERENDER=1 — ignoré');
  process.exit(0);
}

if (!fs.existsSync(path.join(dist, 'index.html'))) {
  console.error('[prerender] dist/index.html manquant — lancez vite build d’abord');
  process.exit(1);
}

function waitForServer(url, attempts = 60) {
  return new Promise((resolve, reject) => {
    let n = 0;
    const tick = () => {
      n += 1;
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (n >= attempts) reject(new Error(`Serveur preview indisponible: ${url}`));
        else setTimeout(tick, 250);
      });
    };
    tick();
  });
}

function writePageHtml(routePath, html) {
  let out = html;
  if (!/^<!DOCTYPE/i.test(out)) out = `<!DOCTYPE html>\n${out}`;

  if (routePath === '/') {
    fs.writeFileSync(path.join(dist, 'index.html'), out);
    return;
  }
  const dir = path.join(dist, routePath.replace(/^\//, ''));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), out);
}

async function main() {
  const { default: puppeteer } = await import('puppeteer');

  console.log(`[prerender] preview sur ${BASE}`);
  const preview = spawn(
    'npx',
    ['vite', 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'],
    {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, BROWSER: 'none' },
    }
  );

  let previewLog = '';
  preview.stdout.on('data', (d) => {
    previewLog += d.toString();
  });
  preview.stderr.on('data', (d) => {
    previewLog += d.toString();
  });

  const shutdown = () => {
    try {
      preview.kill('SIGTERM');
    } catch {
      /* ignore */
    }
  };
  process.on('exit', shutdown);
  process.on('SIGINT', () => {
    shutdown();
    process.exit(1);
  });

  try {
    await waitForServer(BASE);
  } catch (err) {
    console.error(previewLog);
    shutdown();
    throw err;
  }

  const browser = await puppeteer.launch({
    headless: true,
    timeout: 120_000,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--single-process',
    ],
  });

  let ok = 0;
  let fail = 0;

  try {
    for (const page of SEO_PAGES) {
      const url = `${BASE}${page.path === '/' ? '/' : page.path}`;
      const tab = await browser.newPage();
      try {
        await tab.setViewport({ width: 1280, height: 800 });
        await tab.goto(url, { waitUntil: 'networkidle0', timeout: 90_000 });

        // Attendre le contenu React + titre Helmet
        await tab.waitForFunction(
          (expectedTitle) => {
            const root = document.getElementById('root');
            const hasContent = Boolean(root && root.innerText && root.innerText.trim().length > 40);
            const titleOk = !expectedTitle || document.title.includes('CaddyNote');
            return hasContent && titleOk;
          },
          { timeout: 45_000 },
          page.title
        );

        // Laisser Helmet / motion se stabiliser
        await new Promise((r) => setTimeout(r, 400));

        const html = await tab.content();
        writePageHtml(page.path, html);
        ok += 1;
        console.log(`[prerender] ✓ ${page.path}`);
      } catch (e) {
        fail += 1;
        console.error(`[prerender] ✗ ${page.path}:`, e.message || e);
      } finally {
        await tab.close();
      }
    }
  } finally {
    await browser.close();
    shutdown();
  }

  console.log(`[prerender] terminé: ${ok} ok, ${fail} échecs`);
  if (fail > 0 && process.env.PRERENDER_STRICT === '1') {
    process.exit(1);
  }
}

main().catch((err) => {
  const msg = String(err?.message || err);
  const chromiumIssue =
    /WS endpoint|Failed to launch|Could not find Chrome|Browser was not found/i.test(msg);
  if (chromiumIssue && process.env.PRERENDER_STRICT !== '1') {
    console.warn(
      '[prerender] Chromium indisponible — conservation du fallback meta. Définir PRERENDER_STRICT=1 pour faire échouer le build.'
    );
    console.warn(msg);
    process.exit(0);
  }
  console.error('[prerender] fatal:', err);
  process.exit(1);
});
