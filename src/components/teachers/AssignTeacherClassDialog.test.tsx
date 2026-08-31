import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AssignTeacherClassDialog, TeacherHomeroomBadges } from './AssignTeacherClassDialog';

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/select', () => ({
  Select: () => <div data-testid="class-select-stub" />,
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: () => null,
  SelectItem: () => null,
}));

vi.mock('@/services/strkClassService', () => ({
  fetchClassesByInstitution: vi.fn(async () => [
    {
      id: 'c2',
      name: '5ème B',
      institution_id: 'i1',
      teacher_id: 't1',
      teacher_name: 'Bertin Konan',
      academic_year: '2025-2026',
      is_active: true,
    },
  ]),
  assignTeacherToClass: vi.fn(async () => true),
  unassignTeacherFromClass: vi.fn(async () => true),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

import { unassignTeacherFromClass } from '@/services/strkClassService';

describe('AssignTeacherClassDialog', () => {
  beforeEach(() => {
    vi.mocked(unassignTeacherFromClass).mockClear();
  });

  it('affiche la classe titulaire et permet de la retirer', async () => {
    render(
      <AssignTeacherClassDialog
        open
        onOpenChange={vi.fn()}
        teacher={{
          id: 't1',
          name: 'Bertin Konan',
          role: 'teacher',
          institutionId: 'i1',
        }}
        institutionId="i1"
      />
    );

    expect(await screen.findByRole('heading', { name: 'Attribuer une classe' })).toBeInTheDocument();
    const unassign = await screen.findByRole('button', { name: 'Retirer' });
    expect(screen.getByRole('button', { name: 'Attribuer' })).toBeDisabled();

    fireEvent.click(unassign);
    await waitFor(() => {
      expect(unassignTeacherFromClass).toHaveBeenCalledWith('c2');
    });
  });
});

describe('TeacherHomeroomBadges', () => {
  it('affiche les classes titulaire ou un libellé vide', () => {
    const { rerender } = render(
      <TeacherHomeroomBadges
        teacherId="t1"
        classes={[
          {
            id: 'c2',
            name: '5ème B',
            institution_id: 'i1',
            teacher_id: 't1',
            academic_year: '2025-2026',
            is_active: true,
          },
        ]}
      />
    );
    expect(screen.getByText('5ème B')).toBeInTheDocument();

    rerender(<TeacherHomeroomBadges teacherId="t1" classes={[]} />);
    expect(screen.getByText('Aucune classe titulaire')).toBeInTheDocument();
  });
});
