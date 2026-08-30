import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TeacherDashboardHome from './TeacherDashboardHome';
import type { DashboardMetrics } from '@/services/strkAnalyticsService';

vi.mock('@/lib/navConfig', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/navConfig')>();
  return { ...actual, roleLabel: () => 'Enseignant' };
});

const fetchUpcoming = vi.fn();
const loadCoursesByTeacher = vi.fn();

vi.mock('@/services/strkAttendanceService', () => ({
  fetchUpcomingAttendanceCalls: (...args: unknown[]) => fetchUpcoming(...args),
}));

vi.mock('@/hooks/useStrkAuth', () => ({
  useStrkAuth: () => ({ user: { id: 't1', role: 'teacher' } }),
}));

vi.mock('@/hooks/useStrkCourses', () => ({
  useStrkCourses: () => ({
    courses: [
      { id: 'c-math', name: 'Mathématiques', class_id: 'cl1' },
      { id: 'c-hist', name: 'Histoire', class_id: 'cl1' },
    ],
    loadCoursesByTeacher,
  }),
}));

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
  beforeEach(() => {
    fetchUpcoming.mockResolvedValue([]);
    loadCoursesByTeacher.mockReset();
  });

  it('expose À traiter, KPI et CTA Faire l’appel + raccourcis', async () => {
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
    await waitFor(() => {
      expect(screen.getByText(/3 absence\(s\) à suivre/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: /Voir les absences/i })).toHaveAttribute('href', '/absences');

    expect(screen.getAllByText('120').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('96.5 %').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('3').length).toBeGreaterThanOrEqual(1);

    expect(screen.getAllByRole('button', { name: /Faire l'appel/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /^Notes$/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /Cahier de textes/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /^Messages$/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /Emploi du temps/i }).length).toBeGreaterThanOrEqual(1);
  });

  it('propose des raccourcis Appel / Cahier par cours quand aucun créneau urgent', async () => {
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

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Appel · Mathématiques/i })).toHaveAttribute(
        'href',
        '/teacher-attendance?course=c-math'
      );
    });
    expect(screen.getByRole('link', { name: /Cahier · Mathématiques/i })).toHaveAttribute(
      'href',
      '/courses/c-math#cahier'
    );
  });

  it('affiche un empty calme quand il n’y a pas d’absences ni de rappel', async () => {
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

    await waitFor(() => {
      expect(screen.getByText(/Rien à traiter aujourd/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole('link', { name: /Voir les absences/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Faire l'appel/i }).length).toBeGreaterThanOrEqual(1);
  });

  it('affiche un rappel d’appel dans À traiter', async () => {
    fetchUpcoming.mockResolvedValue([
      {
        courseId: 'course-1',
        classId: 'class-1',
        courseName: 'Mathématiques',
        className: '3ème',
        startTime: '16:00',
        scheduleId: 'sch-1',
        minutesUntilStart: 8,
      },
    ]);

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

    await waitFor(() => {
      expect(screen.getByText(/Appel dans 8 min — Mathématiques/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/Début 16:00 · 3ème/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Appel dans 8 min/i })).toHaveAttribute(
      'href',
      '/teacher-attendance?course=course-1'
    );
  });
});
