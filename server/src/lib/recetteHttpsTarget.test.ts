import { afterEach, describe, expect, it } from 'vitest';
import {
  CANONICAL_RECETTE_HTTPS_ORIGIN,
  isApprovedPublicHsts,
  isHttpsLoginConfirmed,
  isPublicOnlyRecette,
  resolveRecetteHttpsTarget,
} from './recetteHttpsTarget.js';

describe('resolveRecetteHttpsTarget', () => {
  const prev = {
    web: process.env.RECETTE_WEB_URL,
    api: process.env.RECETTE_API_URL,
    origin: process.env.RECETTE_HTTPS_ORIGIN,
    pub: process.env.RECETTE_HTTPS_PUBLIC_ONLY,
    confirm: process.env.RECETTE_HTTPS_CONFIRM,
  };

  afterEach(() => {
    const restore = (key: string, value: string | undefined) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    };
    restore('RECETTE_WEB_URL', prev.web);
    restore('RECETTE_API_URL', prev.api);
    restore('RECETTE_HTTPS_ORIGIN', prev.origin);
    restore('RECETTE_HTTPS_PUBLIC_ONLY', prev.pub);
    restore('RECETTE_HTTPS_CONFIRM', prev.confirm);
  });

  it('pointe par défaut sur le sous-domaine HTTPS + /api same-origin', () => {
    const target = resolveRecetteHttpsTarget({});
    expect(target.webUrl).toBe(CANONICAL_RECETTE_HTTPS_ORIGIN);
    expect(target.apiUrl).toBe(`${CANONICAL_RECETTE_HTTPS_ORIGIN}/api`);
    expect(target.isCanonicalHttps).toBe(true);
  });

  it('refuse HTTP sur caddynote.sdcreativ.com', () => {
    expect(() =>
      resolveRecetteHttpsTarget({ RECETTE_WEB_URL: 'http://caddynote.sdcreativ.com' })
    ).toThrow(/https:\/\//);
    expect(() =>
      resolveRecetteHttpsTarget({
        RECETTE_WEB_URL: 'https://caddynote.sdcreativ.com',
        RECETTE_API_URL: 'http://caddynote.sdcreativ.com/api',
      })
    ).toThrow(/RECETTE_API_URL/);
  });

  it('autorise encore le HTTP local pour une recette hors prod', () => {
    const target = resolveRecetteHttpsTarget({
      RECETTE_WEB_URL: 'http://127.0.0.1:8080',
      RECETTE_API_URL: 'http://127.0.0.1:4000',
    });
    expect(target.webUrl).toBe('http://127.0.0.1:8080');
    expect(target.apiUrl).toBe('http://127.0.0.1:4000');
    expect(target.isCanonicalHttps).toBe(false);
  });

  it('lit RECETTE_HTTPS_PUBLIC_ONLY et RECETTE_HTTPS_CONFIRM', () => {
    expect(isPublicOnlyRecette({})).toBe(false);
    expect(isPublicOnlyRecette({ RECETTE_HTTPS_PUBLIC_ONLY: '1' })).toBe(true);
    expect(isPublicOnlyRecette({ RECETTE_HTTPS_PUBLIC_ONLY: 'true' })).toBe(true);
    expect(isHttpsLoginConfirmed({})).toBe(false);
    expect(isHttpsLoginConfirmed({ RECETTE_HTTPS_CONFIRM: '1' })).toBe(true);
  });

  it('n’accepte que le HSTS étape 2 (180 j, sans preload ni includeSubDomains)', () => {
    expect(isApprovedPublicHsts('max-age=15552000')).toBe(true);
    expect(isApprovedPublicHsts('max-age=31536000; includeSubDomains')).toBe(false);
    expect(isApprovedPublicHsts('max-age=31536000; includeSubDomains, max-age=15552000')).toBe(false);
    expect(isApprovedPublicHsts('max-age=15552000; preload')).toBe(false);
    expect(isApprovedPublicHsts('')).toBe(false);
  });
});
