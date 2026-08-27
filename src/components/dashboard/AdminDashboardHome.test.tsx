import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminDashboardHome from './AdminDashboardHome';
import type { DashboardMetrics } from '@/services/strkAnalyticsService';

vi.mock('@/lib/navConfig', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/navConfig')>();
  return { ...actual, roleLabel: () => 'Équipe CaddyNote' };
});

const fetchOps = vi.fn();

vi.mock('@/services/strkOpsService', () => ({
  fetchPlatformOpsQueue: (...args: unknown[]) => fetchOps(...args),
}));

const metrics: DashboardMetrics = {
  totalInstitutions: 4,
  totalUsers: 100,
  students: 80,
  teachers: 12,
  totalSchoolAdmins: 4,
  attendanceRate: 94.5,
  absences: 7,
  recentActivities: [],
};

describe('AdminDashboardHome (équipe CaddyNote)', () => {
  beforeEach(() => {
    fetchOps.mockResolvedValue([]);
  });

  it('expose la console, les KPI et les raccourcis ops plateforme', async () => {
    render(
      <MemoryRouter>
        <AdminDashboardHome
          userName="Alex"
          metrics={metrics}
          metricsState="ready"
          totalInstitutions={4}
          totalStudents={80}
          totalTeachers={12}
        />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: /Bonjour, Alex/i })).toBeInTheDocument();
    expect(screen.getAllByText(/Ops plateforme/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Raccourcis ops/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/Rien d’urgent/i)).toBeInTheDocument();
    });

    expect(screen.getAllByRole('button', { name: /Ops plateforme/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /^Console$/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /^Établissements$/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /Abonnements \(ops\)/i }).length).toBeGreaterThanOrEqual(
      1
    );
    expect(screen.getAllByRole('button', { name: /Support ops/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /Habilitations/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /^Analytics$/i }).length).toBeGreaterThanOrEqual(1);

    expect(screen.queryByRole('button', { name: /^Élèves$/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Sans établissement lié/i)).toBeInTheDocument();

    expect(screen.getAllByText('4').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('80').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/94[,.]5 %/).length).toBeGreaterThanOrEqual(1);
  });

  it('affiche la file À traiter et un CTA vers la priorité ops', async () => {
    fetchOps.mockResolvedValue([
      {
        id: 'tickets-2',
        kind: 'ticket',
        title: '2 ticket(s) support ouverts',
        detail: 'Accès bloqué',
        href: '/super-admin/support-ops',
      },
    ]);

    render(
      <MemoryRouter>
        <AdminDashboardHome
          userName="Alex"
          metrics={metrics}
          metricsState="ready"
          totalInstitutions={4}
          totalStudents={80}
          totalTeachers={12}
        />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/2 ticket\(s\) support ouverts/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/Accès bloqué/i)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Traiter la priorité ops/i }).length).toBeGreaterThanOrEqual(
      1
    );
    expect(screen.getByRole('link', { name: /Traiter maintenant/i })).toHaveAttribute(
      'href',
      '/super-admin/support-ops'
    );
  });

  it('montre les raccourcis établissement seulement si institutionId est fourni', async () => {
    render(
      <MemoryRouter>
        <AdminDashboardHome
          userName="Alex"
          metrics={metrics}
          metricsState="ready"
          totalInstitutions={4}
          totalStudents={80}
          totalTeachers={12}
          institutionId="inst-1"
        />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Contexte établissement/i)).toBeInTheDocument();
    });
    expect(screen.getAllByRole('button', { name: /^Élèves$/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /^Finances$/i }).length).toBeGreaterThanOrEqual(1);
  });
});
