import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { checkA11y } from '@/test/a11y';

vi.mock('@/hooks/useStrkAuth', () => ({
  useStrkAuth: () => ({
    login: vi.fn(),
    verifyMfaCode: vi.fn(),
    cancelMfaChallenge: vi.fn(),
    user: null,
    isLoading: false,
    authError: null,
  }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

import { StrkLoginForm } from './StrkLoginForm';

// Lot 12 / UX-004 : parcours de connexion (premier écran authentifié).
describe('StrkLoginForm (UX-004)', () => {
  it("n'a aucune violation d'accessibilité détectable (hors contraste)", async () => {
    const { container } = render(
      <MemoryRouter>
        <StrkLoginForm />
      </MemoryRouter>
    );
    const results = await checkA11y(container);
    expect(results).toHaveNoViolations();
  });

  it('associe les champs email et mot de passe à un libellé', () => {
    const { getByLabelText } = render(
      <MemoryRouter>
        <StrkLoginForm />
      </MemoryRouter>
    );
    expect(getByLabelText('Email')).toBeInTheDocument();
    expect(getByLabelText('Mot de passe')).toBeInTheDocument();
    expect(getByLabelText('Afficher le mot de passe')).toBeInTheDocument();
  });
});
