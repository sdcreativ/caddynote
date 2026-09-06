import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n/config';
import { checkA11y } from '@/test/a11y';
import LegalNoticePage from '@/pages/LegalNoticePage';
import PrivacyPage from '@/pages/PrivacyPage';

describe('Pages légales (a11y + liens)', () => {
  it('Mentions légales : titre, lien confidentialité, axe hors contraste', async () => {
    const { container } = render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <LegalNoticePage />
        </MemoryRouter>
      </I18nextProvider>
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Mentions légales' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /confidentialité/i }).length).toBeGreaterThan(0);
    expect(await checkA11y(container)).toHaveNoViolations();
  });

  it('Confidentialité : titre, lien mentions, axe hors contraste', async () => {
    const { container } = render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <PrivacyPage />
        </MemoryRouter>
      </I18nextProvider>
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Politique de confidentialité' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /mentions légales/i }).length).toBeGreaterThan(0);
    expect(await checkA11y(container)).toHaveNoViolations();
  });
});
