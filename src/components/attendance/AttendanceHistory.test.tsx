import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { AttendanceHistory } from './AttendanceHistory';

vi.mock('@/services/strkAttendanceService', () => ({
  fetchAttendanceHistoryByClass: vi.fn(),
}));

import { fetchAttendanceHistoryByClass } from '@/services/strkAttendanceService';

const students = [
  { id: 's1', name: 'Awa Koné', studentNumber: 'A001' },
  { id: 's2', name: 'Jean Dupont', studentNumber: 'A002' },
];

describe('AttendanceHistory', () => {
  beforeEach(() => {
    vi.mocked(fetchAttendanceHistoryByClass).mockReset();
  });

  it('affiche les absences/retards de la classe avec filtres', async () => {
    vi.mocked(fetchAttendanceHistoryByClass).mockResolvedValue([
      {
        id: 'a1',
        student_id: 's1',
        institution_id: 'i1',
        date: '2026-08-20',
        type: 'absence',
        duration: 60,
        justified: false,
      },
      {
        id: 'a2',
        student_id: 's2',
        institution_id: 'i1',
        date: '2026-08-21',
        type: 'lateness',
        duration: 15,
        justified: true,
        reason: 'Bus',
      },
    ]);

    render(<AttendanceHistory classId="c1" className="1ère" students={students} />);

    await waitFor(() => {
      expect(screen.getByText('Awa Koné')).toBeInTheDocument();
    });
    expect(screen.getByText('Jean Dupont')).toBeInTheDocument();
    expect(screen.getByText(/Bus/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Rechercher un élève/i), {
      target: { value: 'Awa' },
    });
    expect(screen.getByText('Awa Koné')).toBeInTheDocument();
    expect(screen.queryByText('Jean Dupont')).not.toBeInTheDocument();
  });

  it('montre un état vide quand il n’y a aucun enregistrement', async () => {
    vi.mocked(fetchAttendanceHistoryByClass).mockResolvedValue([]);

    render(<AttendanceHistory classId="c1" className="1ère" students={students} />);

    await waitFor(() => {
      expect(screen.getByText(/Aucun historique/i)).toBeInTheDocument();
    });
  });
});
