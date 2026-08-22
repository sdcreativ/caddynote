#!/usr/bin/env node
/**
 * NFR-008 — contraste *peint* (rendu réel navigateur).
 *
 * jsdom / vitest-axe ne voient pas les couleurs calculées. Ce script lance
 * Chromium (Puppeteer), injecte axe-core et échoue sur les violations
 * `color-contrast` des parcours publics essentiels.
 *
 * Usage :
 *   A11Y_BASE_URL=http://127.0.0.1:8080 npm run a11y:paint
 *
 * Prérequis : frontend joignable (`npm run dev` ou `npm run preview`).
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const require = createRequire(import.meta.url);
const axePath = require.resolve('axe-core/axe.min.js');

const BASE = process.env.A11Y_BASE_URL || 'http://127.0.0.1:8080';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'a11y-output');

const PAGES = [
  { id: 'home', path: '/' },
  { id: 'sign', path: '/sign' },
  { id: 'signup', path: '/signup' },
  { id: 'about', path: '/about' },
  { id: 'contact', path: '/contact' },
  { id: 'help', path: '/aide' },
  { id: 'forgot', path: '/forgot-password' },
];

async function auditPage(browser, pageSpec) {
  const page = await browser.newPage();
  const url = `${BASE}${pageSpec.path}`;
  try {
    await page.setViewport({ width: 1280, height: 800 });
    // Évite les faux positifs axe pendant les fade Framer (opacité partielle).
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    const response = await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
    const status = response?.status() ?? 0;
    if (status >= 400) {
      return {
        id: pageSpec.id,
        url,
        ok: false,
        error: `HTTP ${status}`,
        violations: [],
      };
    }
    await page.waitForFunction(() => document.fonts?.status === 'loaded' || !document.fonts, {
      timeout: 5000,
    }).catch(() => {});
    await new Promise((r) => setTimeout(r, 400));
    await page.addScriptTag({ path: axePath });
    const results = await page.evaluate(async () => {
      // eslint-disable-next-line no-undef
      return axe.run(document, {
        runOnly: { type: 'rule', values: ['color-contrast'] },
        resultTypes: ['violations'],
      });
    });
    const violations = (results.violations || []).map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: (v.nodes || []).slice(0, 8).map((n) => ({
        target: n.target,
        html: (n.html || '').slice(0, 180),
        failureSummary: n.failureSummary,
      })),
    }));
    return {
      id: pageSpec.id,
      url,
      ok: violations.length === 0,
      error: null,
      violations,
    };
  } catch (err) {
    return {
      id: pageSpec.id,
      url,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      violations: [],
    };
  } finally {
    await page.close();
  }
}

async function main() {
  // Smoke : base joignable
  try {
    const probe = await fetch(BASE, { redirect: 'manual' });
    if (probe.status >= 500) {
      throw new Error(`HTTP ${probe.status}`);
    }
  } catch (err) {
    console.error(`Frontend injoignable sur ${BASE}`);
    console.error((err instanceof Error ? err.message : err) || '');
    console.error('Lancez `npm run dev` (port 8080) ou `npm run preview`, puis :');
    console.error('  A11Y_BASE_URL=http://127.0.0.1:8080 npm run a11y:paint');
    process.exit(2);
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const reports = [];
  try {
    for (const spec of PAGES) {
      process.stdout.write(`Audit ${spec.path} … `);
      const report = await auditPage(browser, spec);
      reports.push(report);
      if (report.error) {
        console.log(`FAIL (${report.error})`);
      } else if (report.ok) {
        console.log('PASS (color-contrast)');
      } else {
        const n = report.violations.reduce((acc, v) => acc + v.nodes.length, 0);
        console.log(`FAIL (${n} nœud(s))`);
      }
    }
  } finally {
    await browser.close();
  }

  mkdirSync(outDir, { recursive: true });
  const payload = {
    date: new Date().toISOString(),
    base: BASE,
    rule: 'color-contrast',
    pages: reports,
  };
  writeFileSync(path.join(outDir, 'paint-latest.json'), JSON.stringify(payload, null, 2));

  const md = [
    '# Audit contraste peint (NFR-008)',
    '',
    `| Champ | Valeur |`,
    `|---|---|`,
    `| Date | ${payload.date} |`,
    `| Base | ${BASE} |`,
    `| Règle | axe \`color-contrast\` (rendu Chromium) |`,
    '',
    '| Page | Résultat | Détail |',
    '|---|---|---|',
    ...reports.map((r) => {
      if (r.error) return `| ${r.id} (\`${r.url}\`) | Fail | ${r.error} |`;
      if (r.ok) return `| ${r.id} | Pass | aucun contraste insuffisant |`;
      const detail = r.violations
        .flatMap((v) => v.nodes.map((n) => `${(n.target || []).join(' ')}`))
        .slice(0, 5)
        .join('; ');
      return `| ${r.id} | Fail | ${detail || r.violations[0]?.help || 'violations'} |`;
    }),
    '',
    'Complète les tokens HSL (`npm test -- src/lib/colorContrast.test.ts`) : ici les couleurs *calculées* après CSS/Tailwind.',
    '',
    'Voir aussi `docs/A11Y.md`.',
    '',
  ];
  writeFileSync(path.join(outDir, 'paint-latest.md'), md.join('\n'));

  const failed = reports.filter((r) => !r.ok);
  console.log(`\nRapport : ${path.join(outDir, 'paint-latest.md')}`);
  console.log(`Contraste peint : ${reports.length - failed.length}/${reports.length} pages pass`);
  if (failed.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
