import { describe, expect, it } from 'vitest';
import { normalizeEmail, normalizeOptionalEmail } from '../lib/emailNormalize.js';
import { requiredEmail, optionalEmail } from '../lib/zodHelpers.js';

describe('normalizeEmail', () => {
  it('trim + minuscules', () => {
    expect(normalizeEmail('  Ada.Lovelace@Example.COM ')).toBe('ada.lovelace@example.com');
  });

  it('optional vide → undefined', () => {
    expect(normalizeOptionalEmail('')).toBeUndefined();
    expect(normalizeOptionalEmail('   ')).toBeUndefined();
    expect(normalizeOptionalEmail(null)).toBeUndefined();
    expect(normalizeOptionalEmail(undefined)).toBeUndefined();
  });
});

describe('requiredEmail / optionalEmail (Zod)', () => {
  it('normalise un e-mail obligatoire', () => {
    expect(requiredEmail.parse('  Jean@School.SN ')).toBe('jean@school.sn');
  });

  it('refuse un e-mail invalide', () => {
    expect(requiredEmail.safeParse('pas-un-email').success).toBe(false);
  });

  it('optionalEmail normalise ou ignore le vide', () => {
    expect(optionalEmail.parse('  A@B.COM ')).toBe('a@b.com');
    expect(optionalEmail.parse('')).toBeUndefined();
    expect(optionalEmail.parse(null)).toBeUndefined();
  });
});
