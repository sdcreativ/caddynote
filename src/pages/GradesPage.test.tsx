import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import GradesPageEntry from './GradesPage';
import { useStrkAuth } from '@/hooks/useStrkAuth';

const {
  fetchGradesByTeacher,
  fetchGradesByInstitution,
  fetchCoursesByInstitution,
  fetchCoursesByTeacher,
  fetchAcademicPeriods,
  fetchGradingScales,
} = vi.hoisted(() => ({
  fetchGradesByTeacher: vi.fn(),
  fetchGradesByInstitution: vi.fn(),
  fetchCoursesByInstitution: vi.fn(),
  fetchCoursesByTeacher: vi.fn(),
  fetchAcademicPeriods: vi.fn(),
  fetchGradingScales: vi.fn(),
}));

vi.mock('@/hooks/useStrkAuth', () => ({
  useStrkAuth: vi.fn(),
}));

vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ hasPermission: () => true }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/components/ui/confirm-dialog', () => ({
  useConfirmDialog: () => vi.fn(),
}));

vi.mock('@/services/strkGradeService', () => ({
  fetchGradesByTeacher,
  fetchGradesByInstitution,
  createGrade: vi.fn(),
  createGradesBulk: vi.fn(),
  importGradesCsv: vi.fn(),
  publishGrades: vi.fn(),
  computeClassGrades: vi.fn(),
}));

vi.mock('@/services/strkCourseService', () => ({
  fetchCoursesByTeacher,
  fetchCoursesByInstitution,
}));

vi.mock('@/services/strkAcademicPeriodService', () => ({
  fetchAcademicPeriods,
}));

vi.mock('@/services/strkGradingScaleService', () => ({
  fetchGradingScales,
}));

vi.mock('@/services/strkAttendanceService', () => ({
  fetchStudentsByClass: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/lib/productTelemetry', () => ({
  trackProductEvent: vi.fn(),
}));

const mockedAuth = vi.mocked(useStrkAuth);

describe('GradesPageEntry (doubles portes)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchGradesByTeacher.mockResolvedValue([]);
    fetchGradesByInstitution.mockResolvedValue([]);
    fetchCoursesByInstitution.mockResolvedValue([]);
    fetchCoursesByTeacher.mockResolvedValue([]);
    fetchAcademicPeriods.mockResolvedValue([]);
    fetchGradingScales.mockResolvedValue([]);
  });

  it('redirige l’élève de /grades vers /my-grades', async () => {
    mockedAuth.mockReturnValue({
      user: { id: 'stu-1', role: 'student', institutionId: 'inst-1' },
      isLoading: false,
    } as ReturnType<typeof useStrkAuth>);

    render(
      <MemoryRouter initialEntries={['/grades']}>
        <Routes>
          <Route path="/grades" element={<GradesPageEntry />} />
          <Route path="/my-grades" element={<div>Mes notes élève</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText('Mes notes élève')).toBeInTheDocument();
  });

  it('charge la liste établissement pour la Direction et masque la création sans cours', async () => {
    mockedAuth.mockReturnValue({
      user: { id: 'adm-1', role: 'school_admin', institutionId: 'inst-1' },
      isLoading: false,
    } as ReturnType<typeof useStrkAuth>);

    render(
      <MemoryRouter>
        <GradesPageEntry />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(fetchGradesByInstitution).toHaveBeenCalled();
    });
    expect(fetchGradesByTeacher).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(screen.getByText(/Aucun cours configuré/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /Nouvelle note/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Saisie en grille/i })).not.toBeInTheDocument();
  });

  it('affiche la création Direction dès qu’un cours existe', async () => {
    mockedAuth.mockReturnValue({
      user: { id: 'adm-1', role: 'school_admin', institutionId: 'inst-1' },
      isLoading: false,
    } as ReturnType<typeof useStrkAuth>);
    fetchCoursesByInstitution.mockResolvedValue([
      { id: 'c1', name: 'Maths', class_id: 'cl1', class_name: '6e A' },
    ]);
    fetchGradesByInstitution.mockResolvedValue([
      {
        id: 'g1',
        student_id: 's1',
        course_id: 'c1',
        teacher_id: 't1',
        grade_value: 14,
        max_grade: 20,
        grade_type: 'evaluation',
        title: 'DS1',
        date: '2026-09-01',
        created_at: '',
        updated_at: '',
      },
    ]);

    render(
      <MemoryRouter>
        <GradesPageEntry />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('DS1')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /Nouvelle note/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Saisie/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Publication & calcul/i })).toBeInTheDocument();
  });

  it('redirige l’admin plateforme sans établissement vers /institutions', async () => {
    mockedAuth.mockReturnValue({
      user: { id: 'plat-1', role: 'admin', institutionId: null },
      isLoading: false,
    } as ReturnType<typeof useStrkAuth>);

    render(
      <MemoryRouter initialEntries={['/grades']}>
        <Routes>
          <Route path="/grades" element={<GradesPageEntry />} />
          <Route path="/institutions" element={<div>Liste établissements</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText('Liste établissements')).toBeInTheDocument();
    expect(fetchGradesByInstitution).not.toHaveBeenCalled();
    expect(fetchGradesByTeacher).not.toHaveBeenCalled();
  });

  it('laisse l’admin avec établissement accéder aux notes', async () => {
    mockedAuth.mockReturnValue({
      user: { id: 'adm-linked', role: 'admin', institutionId: 'inst-1' },
      isLoading: false,
    } as ReturnType<typeof useStrkAuth>);

    render(
      <MemoryRouter>
        <GradesPageEntry />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(fetchGradesByInstitution).toHaveBeenCalled();
    });
  });
});
