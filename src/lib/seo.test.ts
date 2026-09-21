import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  absoluteUrl,
  DEFAULT_SEO,
  PUBLIC_SEO_PAGES,
  getSiteUrl,
  normalizePublicOrigin,
} from '@/lib/seo';
import { FEATURES } from '@/data/features';
import { EXPERIENCES } from '@/data/experiences';
import { buildHomeJsonLd, buildSignupJsonLd } from '@/components/seo/jsonLd';

/**
 * §6 P2 — recette SEO / OG des pages clés (contrat RouteSeo + sitemap).
 */
describe('SEO public (recette §6)', () => {
  it('expose un titre et une description non vides sur la home', () => {
    expect(DEFAULT_SEO.title).toMatch(/CaddyNote/);
    expect(DEFAULT_SEO.description.length).toBeGreaterThan(40);
  });

  it('couvre toutes les fonctionnalités et expériences', () => {
    for (const f of FEATURES) {
      const page = PUBLIC_SEO_PAGES.find((p) => p.path === `/fonctionnalites/${f.slug}`);
      expect(page, `SEO manquant pour ${f.slug}`).toBeTruthy();
      expect(page!.title).toContain(f.title);
      expect(page!.description.length).toBeGreaterThan(20);
      expect(page!.type).toBe('article');
    }
    for (const e of EXPERIENCES) {
      const page = PUBLIC_SEO_PAGES.find((p) => p.path === `/experiences/${e.slug}`);
      expect(page, `SEO manquant pour ${e.slug}`).toBeTruthy();
      expect(page!.title).toMatch(/CaddyNote/);
    }
  });

  it('indexe les pages marketing clés', () => {
    for (const path of [
      '/',
      '/about',
      '/contact',
      '/aide',
      '/signup',
      '/espace-parent',
      '/admissions',
      '/mentions-legales',
      '/confidentialite',
    ]) {
      const page = PUBLIC_SEO_PAGES.find((p) => p.path === path);
      expect(page, path).toBeTruthy();
      expect(page!.noIndex).toBeFalsy();
      expect(page!.title.length).toBeGreaterThan(5);
      expect(page!.description.length).toBeGreaterThan(20);
    }
  });

  it('noindex les pages auth', () => {
    for (const path of ['/sign', '/forgot-password', '/reset-password']) {
      const page = PUBLIC_SEO_PAGES.find((p) => p.path === path);
      expect(page?.noIndex).toBe(true);
    }
  });

  it('absoluteUrl respecte VITE_SITE_URL / défaut', () => {
    expect(getSiteUrl()).toMatch(/^https?:\/\//);
    expect(absoluteUrl('/about')).toMatch(/\/about$/);
    expect(absoluteUrl('/')).not.toMatch(/\/$/); // base sans slash final répété
  });

  it('force HTTPS et caddynote.sdcreativ.com, sans toucher localhost / IP', () => {
    expect(normalizePublicOrigin('http://caddynote.sdcreativ.com')).toBe('https://caddynote.sdcreativ.com');
    expect(normalizePublicOrigin('https://caddynote.sdcreativ.com/')).toBe('https://caddynote.sdcreativ.com');
    expect(normalizePublicOrigin('caddynote.sdcreativ.com')).toBe('https://caddynote.sdcreativ.com');
    expect(normalizePublicOrigin('http://caddynote.com')).toBe('https://caddynote.sdcreativ.com');
    expect(normalizePublicOrigin('https://www.caddynote.com/')).toBe('https://caddynote.sdcreativ.com');
    expect(normalizePublicOrigin('http://88.96.41.213:8080')).toBe('http://88.96.41.213:8080');
    expect(normalizePublicOrigin('http://localhost:8080')).toBe('http://localhost:8080');
  });

  it('décrit /signup comme accès école, sans essai public', () => {
    const page = PUBLIC_SEO_PAGES.find((p) => p.path === '/signup');
    expect(page?.title).toMatch(/Obtenir un compte/);
    expect(page?.title).not.toMatch(/essai/i);
    expect(page?.description).toMatch(/établissement/i);
    expect(page?.description).not.toMatch(/essai gratuit/i);
    const ld = JSON.stringify(buildSignupJsonLd());
    expect(ld).not.toMatch(/essai gratuit/i);
    expect(ld).toMatch(/Obtenir un compte/);
  });

  it('n’annonce pas un prix 0 EUR sur la home', () => {
    const offer = buildHomeJsonLd().find((item) => item['@type'] === 'SoftwareApplication')?.offers as {
      price?: string;
      priceCurrency?: string;
    };
    expect(offer?.price).toBeUndefined();
    expect(offer?.priceCurrency).toBe('XOF');
  });

  it('applique les Disallow applicatifs à tous les robots, sans override Googlebot', () => {
    const robots = readFileSync(resolve(process.cwd(), 'public/robots.txt'), 'utf8');
    expect(robots).not.toMatch(/User-agent:\s*Googlebot/i);
    expect(robots).toMatch(/Disallow: \/students/);
    expect(robots).toMatch(/Disallow: \/finance/);
    expect(robots).toMatch(/Sitemap: https:\/\/caddynote\.sdcreativ\.com\/sitemap\.xml/);
    const sitemap = readFileSync(resolve(process.cwd(), 'public/sitemap.xml'), 'utf8');
    expect(sitemap).toMatch(/https:\/\/caddynote\.sdcreativ\.com\//);
    expect(sitemap).toMatch(/\/espace-parent/);
    expect(sitemap).not.toMatch(/https?:\/\/caddynote\.com/);
  });
});
