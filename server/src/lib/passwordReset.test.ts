import { describe, expect, it } from 'vitest';
import {
  buildResetPasswordUrl,
  extractResetTokenFromUrl,
  hashPasswordResetToken,
  isLegacyPlainResetToken,
  issuePasswordResetSecret,
} from './passwordReset.js';

describe('passwordReset', () => {
  it('le hash n’est pas le secret et est stable', () => {
    const { raw, hash } = issuePasswordResetSecret();
    expect(hash).toBe(hashPasswordResetToken(raw));
    expect(hash).not.toBe(raw);
    expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(isLegacyPlainResetToken(hash)).toBe(false);
    expect(raw).not.toMatch(/^[a-f0-9]{64}$/);
  });

  it('l’URL de reset met le jeton dans le fragment, pas la query', () => {
    const url = buildResetPasswordUrl('https://app.example.com/', 'secret-token');
    expect(url).toBe('https://app.example.com/reset-password#token=secret-token');
    expect(url).not.toContain('?token=');
    expect(extractResetTokenFromUrl(url)).toBe('secret-token');
    expect(extractResetTokenFromUrl('https://app.example.com/reset-password?token=old')).toBeNull();
  });

  it('reconnaît un jeton legacy hex 64', () => {
    expect(isLegacyPlainResetToken('a'.repeat(64))).toBe(true);
    expect(isLegacyPlainResetToken('not-hex')).toBe(false);
  });
});
