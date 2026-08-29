import { describe, it, expect, afterEach } from 'vitest';
import {
  computeExpiry,
  durationSpecToMs,
  resolveAccessTokenExpiresIn,
} from '../lib/sessions.js';

describe('sessions — durée JWT', () => {
  const prevJwt = process.env.JWT_EXPIRES_IN;
  const prevDeploy = process.env.CADDYNOTE_DEPLOYMENT;
  const prevTest = process.env.CADDYNOTE_TEST_MODE;

  afterEach(() => {
    if (prevJwt === undefined) delete process.env.JWT_EXPIRES_IN;
    else process.env.JWT_EXPIRES_IN = prevJwt;
    if (prevDeploy === undefined) delete process.env.CADDYNOTE_DEPLOYMENT;
    else process.env.CADDYNOTE_DEPLOYMENT = prevDeploy;
    if (prevTest === undefined) delete process.env.CADDYNOTE_TEST_MODE;
    else process.env.CADDYNOTE_TEST_MODE = prevTest;
  });

  it('parse les specs usuelles', () => {
    expect(durationSpecToMs('12h')).toBe(12 * 3600_000);
    expect(durationSpecToMs('30m')).toBe(30 * 60_000);
    expect(durationSpecToMs('7d')).toBe(7 * 86_400_000);
  });

  it('défaut 12h si env vide', () => {
    delete process.env.JWT_EXPIRES_IN;
    delete process.env.CADDYNOTE_DEPLOYMENT;
    expect(resolveAccessTokenExpiresIn()).toBe('12h');
  });

  it('clamp à 24h en staging/prod si > 24h', () => {
    process.env.CADDYNOTE_DEPLOYMENT = 'staging';
    process.env.CADDYNOTE_TEST_MODE = 'false';
    process.env.JWT_EXPIRES_IN = '7d';
    expect(resolveAccessTokenExpiresIn()).toBe('24h');
    const from = new Date('2026-01-01T00:00:00.000Z');
    const until = computeExpiry('7d', from);
    expect(until.toISOString()).toBe('2026-01-02T00:00:00.000Z');
  });

  it('conserve 12h en staging', () => {
    process.env.CADDYNOTE_DEPLOYMENT = 'production';
    process.env.CADDYNOTE_TEST_MODE = 'false';
    process.env.JWT_EXPIRES_IN = '12h';
    expect(resolveAccessTokenExpiresIn()).toBe('12h');
  });
});
