import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { checkA11y } from '@/test/a11y';

vi.mock('@/hooks/useStrkAuth', () => ({
  useStrkAuth: () => ({
    user: {
      id: 'u1',
      name: 'Ada Lovelace',
      role: 'teacher',
      email: 'ada@test.caddynote',
    },
    logout: vi.fn(),
  }),
}));

vi.mock('@/hooks/useInstitutionBrand', () => ({
  useInstitutionBrand: () => ({
    institutionName: null,
    institutionLogo: null,
    showInstitutionBrand: false,
  }),
}));

vi.mock('@/hooks/useResolvedStoredUrl', () => ({
  useResolvedStoredUrl: () => null,
}));

vi.mock('@/hooks/useEstablishmentDashboardContext', () => ({
  useEstablishmentDashboardContext: () => ({
    alerts: [],
  }),
}));

vi.mock('@/lib/navConfig', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/navConfig')>();
  return { ...actual, isSchoolShellRole: () => false };
});

import StrkNavbar from './StrkNavbar';

describe('StrkNavbar (UX-004)', () => {
  it('nomme le menu compte et respecte les cibles 44px des icônes', async () => {
    const { container } = render(
      <MemoryRouter>
        <StrkNavbar onToggleSidebar={() => {}} />
      </MemoryRouter>
    );

    expect(screen.getByRole('button', { name: 'Menu compte' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Messages' }).className).toMatch(/\bh-11\b/);
    expect(screen.getByRole('button', { name: 'Notifications' }).className).toMatch(/\bh-11\b/);

    expect(await checkA11y(container)).toHaveNoViolations();
  });

  it('ouvre /notifications depuis la cloche (parent / élève / hors shell école)', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/dashboard" element={<StrkNavbar onToggleSidebar={() => {}} />} />
          <Route path="/notifications" element={<div>Boîte notifications</div>} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    expect(screen.getByText('Boîte notifications')).toBeInTheDocument();
  });
});
