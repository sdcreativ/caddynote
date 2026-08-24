import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { checkA11y } from '@/test/a11y';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n/config';
import SignupPage from '@/pages/SignupPage';

describe('SignupPage — obtenir un compte (Pronote)', () => {
  it('explique le modèle sans formulaire d’inscription libre et passe axe', async () => {
    const { container } = render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <SignupPage />
        </MemoryRouter>
      </I18nextProvider>
    );

    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /connecter/i }).length).toBeGreaterThan(0);
    expect(screen.queryByLabelText('Adresse e-mail')).not.toBeInTheDocument();

    expect(await checkA11y(container)).toHaveNoViolations();
  });
});
