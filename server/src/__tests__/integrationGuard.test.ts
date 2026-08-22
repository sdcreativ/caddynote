import { describe, it, expect } from 'vitest';
import {
  assertSandboxIntegrationKeys,
  detectLiveSecretLabels,
  hasEnv,
} from '../lib/integrationGuard.js';

describe('integrationGuard (sandbox)', () => {
  it('hasEnv ignore les chaînes vides', () => {
    expect(hasEnv('X', { X: '' })).toBe(false);
    expect(hasEnv('X', { X: '  ' })).toBe(false);
    expect(hasEnv('X', { X: 'ok' })).toBe(true);
  });

  it('détecte sk_live_ et bloque sans dérogation', () => {
    const env = { STRIPE_SECRET_KEY: 'sk_live_example' } as NodeJS.ProcessEnv;
    expect(detectLiveSecretLabels(env)).toEqual(['STRIPE_SECRET_KEY (sk_live_)']);
    expect(assertSandboxIntegrationKeys(env)).toMatch(/Clés live/);
  });

  it('autorise sk_test_ et la dérogation ALLOW_LIVE_INTEGRATION_KEYS', () => {
    expect(assertSandboxIntegrationKeys({ STRIPE_SECRET_KEY: 'sk_test_x' } as NodeJS.ProcessEnv)).toBeNull();
    expect(
      assertSandboxIntegrationKeys({
        STRIPE_SECRET_KEY: 'sk_live_x',
        ALLOW_LIVE_INTEGRATION_KEYS: 'true',
      } as NodeJS.ProcessEnv)
    ).toBeNull();
  });
});
