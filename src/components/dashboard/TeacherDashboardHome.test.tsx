import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TeacherDashboardHome from './TeacherDashboardHome';
import type { DashboardMetrics } from '@/services/strkAnalyticsService';

vi.mock('@/lib/navConfig', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/navConfig')>();
  return { ...actual, roleLabel: () => 'Enseignant' };
});

const metrics: DashboardMetrics = {
  totalInstitutions: 1,
  totalUsers: 10,
  students: 120,
  teachers: 8,
  totalSchoolAdmins: 1,
  attendanceRate: 96.5,
  absences: 3,
  recentActivities: [],
};

describe('TeacherDashboardHome (cockpit deux clics)', () => {
  it('expose À traiter, KPI et CTA Faire l’appel + raccourcis', () => {
    render(
      <MemoryRouter>
        <TeacherDashboardHome
          userName="Ada"
          role="teacher"
          metrics={metrics}
          metricsState="ready"
          totalStudents={120}
        />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: /Bonjour, Ada/i })).toBeInTheDocument();
    expect(screen.getByText('À traiter')).toBeInTheDocument();
    expect(screen.getByText(/3 absence\(s\) à suivre/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Voir les absences/i })).toHaveAttribute('href', '/absences');

    expect(screen.getAllByText('120').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('96.5 %').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('3').length).toBeGreaterThanOrEqual(1);

    expect(screen.getAllByRole('button', { name: /Faire l'appel/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /^Notes$/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /Mes cours/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /^Messages$/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /Calendrier/i }).length).toBeGreaterThanOrEqual(1);
  });

  it('affiche un empty calme quand il n’y a pas d’absences', () => {
    render(
      <MemoryRouter>
        <TeacherDashboardHome
          userName="Ada"
          role="teacher"
          metrics={{ ...metrics, absences: 0 }}
          metricsState="ready"
          totalStudents={120}
        />
      </MemoryRouter>
    );

    expect(screen.getByText(/Rien à traiter aujourd/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Voir les absences/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Faire l'appel/i }).length).toBeGreaterThanOrEqual(1);
  });
});
