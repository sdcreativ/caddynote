import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/hooks/useStrkAuth', () => ({
  useStrkAuth: () => ({
    user: {
      id: 'u1',
      role: 'teacher',
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

import StrkSidebar from './StrkSidebar';
import MobileBottomNav from './MobileBottomNav';

describe('Shell métier mobile RWD (P0–P2)', () => {
  const originalInnerWidth = window.innerWidth;

  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 390,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: originalInnerWidth,
    });
  });

  it('cache le drawer hors écran lorsqu’il est fermé', () => {
    const { container } = render(
      <MemoryRouter>
        <StrkSidebar isOpen={false} onClose={() => undefined} />
      </MemoryRouter>
    );
    const aside = container.querySelector('aside');
    expect(aside?.className).toContain('-translate-x-full');
  });

  it('affiche le drawer et ferme via overlay', () => {
    const onClose = vi.fn();
    const { container } = render(
      <MemoryRouter>
        <StrkSidebar isOpen onClose={onClose} />
      </MemoryRouter>
    );
    const aside = container.querySelector('aside');
    expect(aside?.className).toContain('translate-x-0');
    const overlay = container.querySelector('.fixed.inset-0.z-40');
    expect(overlay).toBeTruthy();
    fireEvent.click(overlay!);
    expect(onClose).toHaveBeenCalled();
  });

  it.each([
    ['teacher', 'Appel'],
    ['school_admin', 'Élèves'],
    ['parent', 'Enfants'],
    ['student', 'Notes'],
    ['accountant', 'Finances'],
  ] as const)('bottom nav %s expose Plus et un slot cœur', (role, heartLabel) => {
    const onOpenMore = vi.fn();
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <MobileBottomNav role={role} onOpenMore={onOpenMore} />
      </MemoryRouter>
    );
    expect(screen.getByLabelText('Navigation principale')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: heartLabel })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Plus$/i }));
    expect(onOpenMore).toHaveBeenCalled();
  });
});
