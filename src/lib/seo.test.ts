import { describe, it, expect } from 'vitest';
import {
  absoluteUrl,
  DEFAULT_SEO,
  PUBLIC_SEO_PAGES,
  getSiteUrl,
} from '@/lib/seo';
import { FEATURES } from '@/data/features';
import { EXPERIENCES } from '@/data/experiences';

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
    for (const path of ['/', '/about', '/contact', '/aide', '/signup', '/admissions']) {
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
});
