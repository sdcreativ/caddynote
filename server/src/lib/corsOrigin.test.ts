import { afterEach, describe, expect, it } from 'vitest';
import { assertCorsOriginReady, parseCorsOrigins, resolveCorsOrigin } from './corsOrigin.js';

describe('parseCorsOrigins', () => {
  it('découpe, trim et ignore * / true / vides', () => {
    expect(parseCorsOrigins(' https://app.example.com/,*,true, http://localhost:8080 ')).toEqual([
      'https://app.example.com',
      'http://localhost:8080',
    ]);
  });

  it('retourne [] si absent', () => {
    expect(parseCorsOrigins(undefined)).toEqual([]);
    expect(parseCorsOrigins('')).toEqual([]);
  });
});

describe('resolveCorsOrigin', () => {
  afterEach(() => {
    delete process.env.CADDYNOTE_DEPLOYMENT;
    delete process.env.CADDYNOTE_TEST_MODE;
  });

  it('ne retourne jamais true', () => {
    expect(resolveCorsOrigin({ raw: undefined, hardened: false })).not.toBe(true);
    expect(resolveCorsOrigin({ raw: undefined, hardened: true })).not.toBe(true);
    expect(resolveCorsOrigin({ raw: '*', hardened: true })).not.toBe(true);
  });

  it('utilise la liste fournie', () => {
    expect(resolveCorsOrigin({ raw: 'https://a.test,https://b.test', hardened: true })).toEqual([
      'https://a.test',
      'https://b.test',
    ]);
  });

  it('refuse tout reflet en runtime durci sans CORS_ORIGIN', () => {
    expect(resolveCorsOrigin({ raw: undefined, hardened: true })).toBe(false);
    expect(resolveCorsOrigin({ raw: '*', hardened: true })).toBe(false);
  });

  it('fallback localhost hors durcissement', () => {
    const origins = resolveCorsOrigin({ raw: undefined, hardened: false });
    expect(Array.isArray(origins)).toBe(true);
    expect(origins).toContain('http://localhost:8080');
  });

  it('assertCorsOriginReady refuse de démarrer en staging sans liste', () => {
    const prevDeploy = process.env.CADDYNOTE_DEPLOYMENT;
    const prevTest = process.env.CADDYNOTE_TEST_MODE;
    const prevCors = process.env.CORS_ORIGIN;
    process.env.CADDYNOTE_DEPLOYMENT = 'staging';
    delete process.env.CADDYNOTE_TEST_MODE;
    delete process.env.CORS_ORIGIN;
    expect(() => assertCorsOriginReady()).toThrow(/CORS_ORIGIN obligatoire/);
    if (prevDeploy === undefined) delete process.env.CADDYNOTE_DEPLOYMENT;
    else process.env.CADDYNOTE_DEPLOYMENT = prevDeploy;
    if (prevTest === undefined) delete process.env.CADDYNOTE_TEST_MODE;
    else process.env.CADDYNOTE_TEST_MODE = prevTest;
    if (prevCors === undefined) delete process.env.CORS_ORIGIN;
    else process.env.CORS_ORIGIN = prevCors;
  });
});
