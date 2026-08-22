import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { checkA11y } from '@/test/a11y';

vi.mock('@/hooks/useStrkAuth', () => ({
  useStrkAuth: () => ({
    signup: vi.fn(),
    user: null,
    isLoading: false,
    authError: null,
  }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

import StrkSignupForm from './StrkSignupForm';

describe('StrkSignupForm (UX-004)', () => {
  it('associe les champs requis à un libellé et passe axe', async () => {
    const { container } = render(
      <MemoryRouter>
        <StrkSignupForm embedded />
      </MemoryRouter>
    );

    expect(screen.getByLabelText('Prénom')).toBeInTheDocument();
    expect(screen.getByLabelText('Nom')).toBeInTheDocument();
    expect(screen.getByLabelText('Adresse e-mail')).toBeInTheDocument();

    expect(await checkA11y(container)).toHaveNoViolations();
  });
});
