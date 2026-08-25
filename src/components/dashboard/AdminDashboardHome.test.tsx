import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminDashboardHome from './AdminDashboardHome';
import type { DashboardMetrics } from '@/services/strkAnalyticsService';

vi.mock('@/lib/navConfig', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/navConfig')>();
  return { ...actual, roleLabel: () => 'Équipe CaddyNote' };
});

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
  it('expose la console, les KPI et les modules groupés par rôle', () => {
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
    expect(screen.getByText(/Ops plateforme/i)).toBeInTheDocument();
    expect(screen.getByText(/Fonctionnalités par rôle/i)).toBeInTheDocument();

    expect(screen.getByText('Plateforme')).toBeInTheDocument();
    expect(screen.getByText(/Direction d’établissement/i)).toBeInTheDocument();
    expect(screen.getByText(/Comptabilité & services/i)).toBeInTheDocument();
    expect(screen.getByText(/Famille & communication/i)).toBeInTheDocument();

    expect(screen.getAllByRole('button', { name: /Console plateforme/i }).length).toBeGreaterThanOrEqual(
      1
    );
    expect(screen.getAllByRole('button', { name: /^Console$/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /^Établissements$/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /^Élèves$/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /^Finances$/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /^Messages$/i }).length).toBeGreaterThanOrEqual(1);

    expect(screen.getAllByText('4').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('80').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/94[,.]5 %/).length).toBeGreaterThanOrEqual(1);
  });
});
