import { beforeEach, describe, it, expect, vi } from 'vitest';
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

const baseDashboard = {
  loading: false,
  loadError: null,
  reload: vi.fn(),
  firstName: 'Marie',
  institutionName: 'Lycée Demo',
  studentCount: 240,
  studentsDelta: 2,
  genderHeadcount: { female: 120, male: 120 },
  attendanceToday: { rate: 97.2 },
  finance: { paidCents: 0, pendingCents: 0, overdueCents: 0, currency: 'XOF' },
  admissionsPendingCount: 0,
  alertCount: 0,
  priorityCount: 0,
  alerts: [] as Array<{
    id: string;
    studentName: string;
    classLabel: string;
    kind: 'absence' | 'lateness' | 'payment' | 'admission';
    label: string;
    href: string;
    createdAt: string;
  }>,
  agenda: [] as Array<{ id: string; time: string; title: string }>,
  weekAverage: 96,
  weekAttendance: [],
  hasAttendanceHistory: false,
  tenantStatus: {
    frozen: false,
    isEmpty: false,
    subscriptionStatus: 'active',
  },
};

let mockDashboard = { ...baseDashboard };

vi.mock('@/hooks/useEstablishmentDashboardContext', () => ({
  useEstablishmentDashboardContext: () => mockDashboard,
}));

describe('EstablishmentOverview (cockpit Direction)', () => {
  beforeEach(() => {
    mockDashboard = {
      ...baseDashboard,
      finance: { ...baseDashboard.finance },
      alerts: [],
      agenda: [],
      hasAttendanceHistory: false,
    };
  });

  it('expose À traiter, KPI et raccourcis essentiels sans blocs secondaires vides', () => {
    render(
      <MemoryRouter>
        <EstablishmentOverview />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: /Marie/i })).toBeInTheDocument();
    expect(screen.getByText('À traiter')).toBeInTheDocument();
    expect(screen.getByText(/Rien à traiter aujourd/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Priorités du jour/i })).toBeInTheDocument();

    expect(screen.getAllByText('240').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/97[,.]2%/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(baseDashboard.admissionsPendingCount.toString()).length).toBeGreaterThanOrEqual(
      1
    );

    expect(screen.queryByText(/Paiements reçus/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId('week-chart')).not.toBeInTheDocument();
    expect(screen.queryByTestId('agenda')).not.toBeInTheDocument();
    expect(screen.queryByTestId('finance')).not.toBeInTheDocument();

    expect(screen.getAllByRole('button', { name: /Gérer les élèves/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /^Élèves$/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /^Présences$/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /^Absences$/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /^Admissions$/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /Classes & cours/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /Calendrier/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /^Messages$/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByRole('button', { name: /^Finances$/i })).not.toBeInTheDocument();
  });

  it('propose Faire l’appel quand la présence du jour est absente ou basse', () => {
    mockDashboard = {
      ...baseDashboard,
      attendanceToday: { rate: null },
      alerts: [],
      alertCount: 0,
    };

    render(
      <MemoryRouter>
        <EstablishmentOverview />
      </MemoryRouter>
    );

    expect(screen.getAllByRole('button', { name: /Faire l’appel/i }).length).toBeGreaterThanOrEqual(1);
  });

  it('affiche paiements et finance lorsque la collecte a des données', () => {
    mockDashboard = {
      ...baseDashboard,
      finance: { paidCents: 1_500_000, pendingCents: 200_000, overdueCents: 50_000, currency: 'XOF' },
      hasAttendanceHistory: true,
      agenda: [{ id: 'a1', time: '08:00', title: 'Réunion' }],
    };

    render(
      <MemoryRouter>
        <EstablishmentOverview />
      </MemoryRouter>
    );

    expect(screen.getAllByText(/Paiements reçus/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /^Finances$/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId('week-chart')).toBeInTheDocument();
    expect(screen.getByTestId('agenda')).toBeInTheDocument();
    expect(screen.getByTestId('finance')).toBeInTheDocument();
  });

  it('oriente le CTA primaire vers les admissions s’il y a une alerte admission', () => {
    mockDashboard = {
      ...baseDashboard,
      alertCount: 1,
      priorityCount: 1,
      alerts: [
        {
          id: 'adm-1',
          studentName: 'Awa Koné',
          classLabel: 'awa@example.com',
          kind: 'admission',
          label: 'Préinscription à traiter',
          href: '/admissions/admin',
          createdAt: '2026-08-25T10:00:00Z',
        },
      ],
    };

    render(
      <MemoryRouter>
        <EstablishmentOverview />
      </MemoryRouter>
    );

    expect(screen.getByText(/Awa Koné/i)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Traiter les admissions/i }).length).toBeGreaterThanOrEqual(
      1
    );
    expect(screen.getByRole('link', { name: /Traiter maintenant/i })).toHaveAttribute(
      'href',
      '/admissions/admin'
    );
  });
});
