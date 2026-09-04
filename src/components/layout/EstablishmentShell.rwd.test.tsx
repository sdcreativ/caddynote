import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/hooks/useStrkAuth', () => ({
  useStrkAuth: () => ({
    user: {
      id: 'u1',
      role: 'school_admin',
      institutionId: 'i1',
      name: 'Kouadio Aristide',
      email: 'dir@test.caddynote',
    },
    logout: vi.fn(),
  }),
}));

vi.mock('@/hooks/useEstablishmentDashboardContext', () => ({
  useEstablishmentDashboardContext: () => ({
    badges: {},
    institutionName: 'Établissement — Kouadio Aristide',
    studentCount: 0,
    alertCount: 0,
    alerts: [],
    tenantStatus: { frozen: false, subscriptionStatus: null, isEmpty: true },
  }),
}));

vi.mock('@/hooks/useStrkInstitutions', () => ({
  useStrkInstitutions: () => ({
    institutions: [{ id: 'i1', name: 'Établissement — Kouadio Aristide', logo: null }],
    loadInstitutions: vi.fn(),
    getInstitutionById: vi.fn(async () => ({
      id: 'i1',
      name: 'Établissement — Kouadio Aristide',
      logo: null,
    })),
  }),
}));

vi.mock('@/components/admin/SuperAdminNotificationsBell', () => ({
  SuperAdminNotificationsBell: () => null,
}));

import StrkNavbar from './StrkNavbar';
import { SetupChecklist } from '@/components/dashboard/establishment/SetupChecklist';

vi.mock('@/lib/apiClient', () => ({
  API_BASE_URL: '/api',
  apiClient: {
    get: vi.fn(async (path: string) => {
      if (String(path).includes('/users')) {
        return {
          users: [
            { role: 'teacher' },
            { role: 'teacher' },
          ],
        };
      }
      if (String(path).includes('/classes')) {
        return { classes: [{ id: 'c1' }] };
      }
      return {};
    }),
  },
}));

vi.mock('@/services/strkCourseService', () => ({
  fetchCoursesByInstitution: vi.fn(async () => [{ id: 'course1' }]),
}));

describe('Dashboard établissement mobile RWD', () => {
  it('navbar mobile : logo établissement sans le nom long', async () => {
    render(
      <MemoryRouter>
        <StrkNavbar onToggleSidebar={() => undefined} />
      </MemoryRouter>
    );
    // Le nom complet ne doit pas apparaître en clair dans la barre (aria-label OK).
    expect(screen.queryByText('Établissement — Kouadio Aristide')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Établissement — Kouadio Aristide')).toBeInTheDocument();
    expect(screen.getByLabelText('Ouvrir le menu')).toBeInTheDocument();
  });

  it('setup checklist : CTA court sans débordement de libellé long', async () => {
    render(
      <MemoryRouter>
        <SetupChecklist />
      </MemoryRouter>
    );
    // Enseignants + classes + cours OK, élèves manquants → CTA élèves court
    expect(await screen.findByText('Continuer')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /^Continuer\s*Inscrire des élèves$/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', {
        name: /Continuer : Inscrire des élèves/i,
      })
    ).not.toBeInTheDocument();
  });
});
