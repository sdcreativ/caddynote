import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n/config';
import { PresenceHubTabs } from './PresenceHubTabs';

vi.mock('@/hooks/useStrkAuth', () => ({
  useStrkAuth: () => ({
    user: { id: 't1', role: 'teacher', institutionId: 'inst-1' },
  }),
}));

describe('PresenceHubTabs', () => {
  it('montre l’onglet Signatures aussi pour l’enseignant', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/teacher-attendance']}>
          <PresenceHubTabs />
        </MemoryRouter>
      </I18nextProvider>
    );

    expect(screen.getByRole('link', { name: /Signatures/i })).toHaveAttribute(
      'href',
      '/signatures'
    );
    expect(screen.getByRole('link', { name: /Appel/i })).toHaveAttribute(
      'href',
      '/teacher-attendance'
    );
  });
});
