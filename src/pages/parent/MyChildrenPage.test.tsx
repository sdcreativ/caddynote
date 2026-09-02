import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MyChildrenPage from './MyChildrenPage';

const child = {
  guardianLinkId: 'gl1',
  studentId: 's1',
  firstName: 'Awa',
  lastName: 'Koné',
  className: '6ème A',
  profileImage: null,
  institutionId: 'inst1',
  relationship: 'mother' as const,
  isPrimaryContact: true,
  canViewGrades: true,
  canViewAttendance: true,
  canViewBilling: true,
  canMakePayments: true,
  canViewDiscipline: true,
  canViewHealth: true,
};

vi.mock('@/hooks/useGuardianChildren', () => ({
  useGuardianChildren: () => ({
    children: [child],
    isLoading: false,
    selectedChildId: 's1',
    selectedChild: child,
    setSelectedChildId: vi.fn(),
  }),
}));

vi.mock('@/hooks/useStrkAbsences', () => ({
  useStrkAbsences: () => ({
    absences: [],
    loadAbsencesByStudent: vi.fn(),
    isLoading: false,
  }),
}));

vi.mock('@/services/strkGradeService', () => ({
  fetchStudentGradeSummary: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/services/strkFinanceService', () => ({
  fetchInvoicesByStudent: vi.fn().mockResolvedValue([]),
  initiateCinetPayPayment: vi.fn(),
  initiateStripePayment: vi.fn(),
  formatInvoiceMoney: (_inv: unknown, cents: number) => `${cents / 100} F`,
}));

vi.mock('@/services/strkAdmissionService', () => ({
  fetchMyAdmissionApplications: vi.fn().mockResolvedValue({ applications: [] }),
}));

vi.mock('@/services/strkAbsenceService', () => ({
  openAbsenceJustificationFile: vi.fn(),
}));

vi.mock('@/lib/apiClient', () => ({
  apiClient: {
    get: vi.fn().mockResolvedValue({ children: [] }),
    post: vi.fn(),
  },
  ApiError: class ApiError extends Error {},
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/components/students/StudentHealthForm', () => ({
  StudentHealthForm: () => <div>Formulaire santé</div>,
}));

vi.mock('@/components/absences/JustificationDialog', () => ({
  JustificationDialog: () => null,
}));

describe('MyChildrenPage (hub densifié)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('montre Absences / Notes / Finances en primaire et Santé / Services dans Plus', () => {
    render(
      <MemoryRouter initialEntries={['/my-children']}>
        <MyChildrenPage />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: 'Mes enfants' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Absences' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Notes' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Finances' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Santé' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Services' })).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Autres rubriques' })).toBeInTheDocument();
  });
});
