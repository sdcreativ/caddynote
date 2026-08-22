#!/usr/bin/env node
/**
 * Post-build SEO léger :
 * 1. Génère sitemap.xml
 * 2. Injecte meta dans dist/<route>/index.html (fallback si prerender navigateur désactivé)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SEO_PAGES, SITE, OG_IMAGE } from './seo-routes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function injectMeta(html, page) {
  const url = page.path === '/' ? `${SITE}/` : `${SITE}${page.path}`;
  const title = escapeHtml(page.title);
  const description = escapeHtml(page.description);

  let out = html;
  out = out.replace(/<title>[^<]*<\/title>/i, `<title>${title}</title>`);
  out = out.replace(
    /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="description" content="${description}" />`
  );
  out = out.replace(
    /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/i,
    `<link rel="canonical" href="${url}" />`
  );
  out = out.replace(
    /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:title" content="${title}" />`
  );
  out = out.replace(
    /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:description" content="${description}" />`
  );
  out = out.replace(
    /<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:url" content="${url}" />`
  );
  out = out.replace(
    /<meta\s+property="og:image"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:image" content="${OG_IMAGE}" />`
  );
  out = out.replace(
    /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="twitter:title" content="${title}" />`
  );
  out = out.replace(
    /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="twitter:description" content="${description}" />`
  );
  out = out.replace(
    /<meta\s+name="twitter:image"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="twitter:image" content="${OG_IMAGE}" />`
  );

  const noscript = `<noscript><main><h1>${title}</h1><p>${description}</p><p><a href="${SITE}/">CaddyNote</a></p></main></noscript>`;
  if (!out.includes('<noscript>')) {
    out = out.replace('<div id="root"></div>', `<div id="root"></div>\n    ${noscript}`);
  }

  return out;
}

function writeSitemap() {
  const today = new Date().toISOString().slice(0, 10);
  const urls = SEO_PAGES.map((p) => {
    const loc = p.path === '/' ? `${SITE}/` : `${SITE}${p.path}`;
    const priority =
      p.path === '/'
        ? '1.0'
        : p.path.startsWith('/fonctionnalites') || p.path.startsWith('/experiences')
          ? '0.8'
          : '0.7';
    return `  <url>
    <loc>${loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${priority}</priority>
  </url>`;
  }).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

  fs.writeFileSync(path.join(root, 'public', 'sitemap.xml'), xml);
  if (fs.existsSync(dist)) {
    fs.writeFileSync(path.join(dist, 'sitemap.xml'), xml);
  }
  console.log(`[seo-build] sitemap.xml (${SEO_PAGES.length} urls)`);
}

function injectMetaFallback() {
  const indexPath = path.join(dist, 'index.html');
  if (!fs.existsSync(indexPath)) {
    console.warn('[seo-build] dist/index.html introuvable — skip meta fallback');
    return;
  }
  const base = fs.readFileSync(indexPath, 'utf8');

  for (const page of SEO_PAGES) {
    const html = injectMeta(base, page);
    if (page.path === '/') {
      fs.writeFileSync(indexPath, html);
      continue;
    }
    const dir = path.join(dist, page.path.replace(/^\//, ''));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), html);
  }
  console.log(`[seo-build] meta fallback pour ${SEO_PAGES.length} pages`);
}

writeSitemap();
injectMetaFallback();
