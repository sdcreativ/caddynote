import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SupervisorDashboardHome from './SupervisorDashboardHome';
import type { DashboardMetrics } from '@/services/strkAnalyticsService';

vi.mock('@/lib/navConfig', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/navConfig')>();
  return { ...actual, roleLabel: () => 'Vie scolaire' };
});

const metrics: DashboardMetrics = {
  totalInstitutions: 1,
  totalUsers: 10,
  students: 200,
  teachers: 15,
  totalSchoolAdmins: 1,
  attendanceRate: 93.2,
  absences: 11,
  recentActivities: [],
};

describe('SupervisorDashboardHome', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-01T10:00:00'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('propose Gérer les absences et les raccourcis essentiels', () => {
    render(
      <MemoryRouter>
        <SupervisorDashboardHome
          userName="Paul"
          metrics={metrics}
          metricsState="ready"
          totalStudents={200}
        />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: /Bonjour, Paul/i })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Gérer les absences/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /Faire l'appel/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /^Suivi$/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /^Messages$/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('11').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/93[,.]2 %/).length).toBeGreaterThanOrEqual(1);
  });
});
