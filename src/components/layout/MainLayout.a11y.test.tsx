import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { checkA11y } from '@/test/a11y';

vi.mock('@/hooks/useStrkAuth', () => ({
  useStrkAuth: () => ({
    user: {
      id: 'u1',
      name: 'Ada Lovelace',
      role: 'teacher',
      institutionId: 'i1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@test.caddynote',
    },
    mfaSetupRequired: false,
    mfaRecommended: false,
    mfaGraceUntil: null,
    mustChangePassword: false,
    clearMustChangePassword: vi.fn(),
    dismissMfaPrompt: vi.fn(),
    markMfaEnabled: vi.fn(),
  }),
}));

vi.mock('@/lib/navConfig', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/navConfig')>();
  return { ...actual, isSchoolShellRole: () => false };
});

vi.mock('@/components/quick-actions/QuickActionsManager', () => ({
  QuickActionsManager: () => null,
}));
vi.mock('@/components/notifications/RealtimeNotifications', () => ({
  RealtimeNotifications: () => null,
}));
vi.mock('@/components/subscription/SubscriptionNotifications', () => ({
  default: () => null,
}));
vi.mock('@/components/settings/TwoFactorAuthDialog', () => ({
  TwoFactorAuthDialog: () => null,
}));
vi.mock('@/components/ui/toaster', () => ({ Toaster: () => null }));
vi.mock('./StrkNavbar', () => ({ default: () => <div>navbar</div> }));
vi.mock('./StrkSidebar', () => ({ default: () => <nav aria-label="sidebar">sidebar</nav> }));
vi.mock('./MobileBottomNav', () => ({ default: () => null }));
vi.mock('./OfflineBanner', () => ({ OfflineBanner: () => null }));

import MainLayout from './MainLayout';

describe('MainLayout skip-link (UX-004)', () => {
  it('place le lien d’évitement en premier et cible #main-content', async () => {
    const { container } = render(
      <MemoryRouter>
        <MainLayout>
          <h1>Tableau de bord</h1>
        </MainLayout>
      </MemoryRouter>
    );

    const skip = screen.getByRole('link', { name: 'Aller au contenu principal' });
    expect(skip).toHaveAttribute('href', '#main-content');
    expect(container.querySelector('#main-content')).not.toBeNull();
    expect(container.querySelector('a,button,input,select,textarea')).toBe(skip);

    expect(await checkA11y(container)).toHaveNoViolations();
  });
});
