import { afterEach, describe, expect, it } from 'vitest';
import { readResetPasswordToken, relocateResetTokenOutOfQuery } from './resetPasswordToken';

describe('readResetPasswordToken', () => {
  it('préfère le fragment à la query', () => {
    expect(readResetPasswordToken('?token=query', '#token=frag')).toBe('frag');
    expect(readResetPasswordToken('?token=query', '')).toBe('query');
    expect(readResetPasswordToken('', '')).toBe('');
  });
});

describe('relocateResetTokenOutOfQuery', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('retire le jeton de la query et le place dans le hash', () => {
    window.history.replaceState(null, '', '/reset-password?token=legacy-secret&x=1');
    relocateResetTokenOutOfQuery();
    expect(window.location.search).not.toContain('token=');
    expect(window.location.search).toContain('x=1');
    expect(window.location.hash).toMatch(/token=legacy-secret/);
    expect(readResetPasswordToken()).toBe('legacy-secret');
  });
});
