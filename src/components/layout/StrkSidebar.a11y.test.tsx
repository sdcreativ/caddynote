import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { checkA11y } from '@/test/a11y';

vi.mock('@/hooks/useStrkAuth', () => ({
  useStrkAuth: () => ({
    user: {
      id: 'u1',
      role: 'school_admin',
      institutionId: 'i1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@test.caddynote',
    },
    logout: vi.fn(),
  }),
}));

vi.mock('@/hooks/useSubscription', () => ({
  useSubscription: () => ({ subscription: null, plan: null, isExpired: false }),
}));

vi.mock('@/hooks/useStrkInstitutions', () => ({
  useStrkInstitutions: () => ({
    institutions: [],
    loadInstitutions: vi.fn(),
    getInstitutionById: vi.fn(async () => ({ id: 'i1', name: 'École Test' })),
  }),
}));

vi.mock('@/hooks/useEstablishmentDashboardContext', () => ({
  useEstablishmentDashboardContext: () => ({
    badges: {},
    institutionName: 'École Test',
    studentCount: 0,
    alertCount: 0,
    alerts: [],
    tenantStatus: { frozen: false, subscriptionStatus: null, isEmpty: true },
  }),
}));

// school_admin utilise le shell établissement (RoleNavBody + upsell)
vi.mock('@/lib/navConfig', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/navConfig')>();
  return {
    ...actual,
    isSchoolShellRole: () => false,
  };
});

import StrkSidebar from './StrkSidebar';

describe('StrkSidebar (UX-004)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('expose une navigation nommée et aria-current sur la page active', async () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <StrkSidebar isOpen onClose={() => {}} />
      </MemoryRouter>
    );

    expect(screen.getByRole('navigation', { name: /navigation/i })).toBeInTheDocument();
    const current = container.querySelector('[aria-current="page"]');
    expect(current).not.toBeNull();

    const results = await checkA11y(container);
    expect(results).toHaveNoViolations();
  });
});
