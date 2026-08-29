import { describe, it, expect } from 'vitest';
import { ApiError } from '@/lib/apiClient';
import { isAuthGateError, isAuthGateToastDescription } from '@/lib/authGate';

describe('authGate', () => {
  it('détecte les codes middleware MDP / MFA', () => {
    expect(isAuthGateError(new ApiError('x', 403, undefined, 'password_change_required'))).toBe(
      true
    );
    expect(isAuthGateError(new ApiError('x', 403, undefined, 'mfa_setup_required'))).toBe(true);
    expect(isAuthGateError(new ApiError('x', 403, undefined, 'feature_disabled'))).toBe(false);
    expect(isAuthGateError(new Error('x'))).toBe(false);
  });

  it('filtre les descriptions toast issues du gate', () => {
    expect(
      isAuthGateToastDescription('Changez votre mot de passe provisoire pour continuer.')
    ).toBe(true);
    expect(isAuthGateToastDescription('Impossible de charger les cours')).toBe(false);
  });
});
