import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SecretaryDashboardHome from './SecretaryDashboardHome';
import type { DashboardMetrics } from '@/services/strkAnalyticsService';

vi.mock('@/lib/navConfig', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/navConfig')>();
  return { ...actual, roleLabel: () => 'Secrétariat' };
});

const metrics: DashboardMetrics = {
  totalInstitutions: 1,
  totalUsers: 10,
  students: 180,
  teachers: 12,
  totalSchoolAdmins: 1,
  attendanceRate: 95.0,
  absences: 7,
  recentActivities: [],
};

describe('SecretaryDashboardHome', () => {
  it('propose Gérer les élèves et les raccourcis essentiels', () => {
    render(
      <MemoryRouter>
        <SecretaryDashboardHome
          userName="Claire"
          metrics={metrics}
          metricsState="ready"
          totalStudents={180}
        />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: /Bonjour, Claire/i })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Gérer les élèves/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /^Présences$/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /^Admissions$/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /^Messages$/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('180').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('7').length).toBeGreaterThanOrEqual(1);
  });
});
