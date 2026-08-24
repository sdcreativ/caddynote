import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { EstablishmentOverview } from './EstablishmentOverview';

vi.mock('@/hooks/useStrkAuth', () => ({
  useStrkAuth: () => ({
    user: { id: 'u1', role: 'school_admin', name: 'Direction Test', institutionId: 'i1' },
  }),
}));

vi.mock('./AttendanceWeekChart', () => ({
  AttendanceWeekChart: () => <div data-testid="week-chart" />,
}));
vi.mock('./TodayAgenda', () => ({
  TodayAgenda: () => <div data-testid="agenda" />,
}));
vi.mock('./FinanceCollecte', () => ({
  FinanceCollecte: () => <div data-testid="finance" />,
}));
vi.mock('./SetupChecklist', () => ({
  SetupChecklist: () => null,
}));
vi.mock('./PriorityAlerts', () => ({
  PriorityAlerts: () => <div data-testid="alerts" />,
}));

vi.mock('@/hooks/useEstablishmentDashboardContext', () => ({
  useEstablishmentDashboardContext: () => ({
    loading: false,
    loadError: null,
    reload: vi.fn(),
    firstName: 'Marie',
    institutionName: 'Lycée Demo',
    studentCount: 240,
    studentsDelta: 2,
    genderHeadcount: { female: 120, male: 120 },
    attendanceToday: { rate: 97.2 },
    finance: { paidCents: 1_500_000, pendingCents: 200_000, overdueCents: 50_000, currency: 'XOF' },
    admissionsPendingCount: 0,
    alertCount: 4,
    priorityCount: 2,
    alerts: [],
    agenda: [],
    weekAverage: 96,
    weekAttendance: [],
    tenantStatus: {
      frozen: false,
      isEmpty: false,
      subscriptionStatus: 'active',
    },
  }),
}));

describe('EstablishmentOverview (Direction mobile)', () => {
  it('expose le CTA élèves et les raccourcis essentiels', () => {
    render(
      <MemoryRouter>
        <EstablishmentOverview />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: /Marie/i })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Gérer les élèves/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /^Présences$/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /^Messages$/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /^Finances$/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /^Admissions$/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('240').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/97[,.]2%/).length).toBeGreaterThanOrEqual(1);
  });
});
