import { describe, it, expect } from 'vitest';

/**
 * Logique d’hydratation des totaux d’appel (extrait testable de QuickAttendance).
 * Si des absences/retards existent pour le jour, les autres élèves = présents.
 */
type AttendanceStatus = 'present' | 'absent' | 'late';

const buildStatusMap = (
  students: { id: string }[],
  records: { student_id: string; type: 'absence' | 'lateness' }[]
): Record<string, AttendanceStatus> => {
  const byStudent = new Map<string, AttendanceStatus>();
  for (const r of records) {
    byStudent.set(r.student_id, r.type === 'lateness' ? 'late' : 'absent');
  }
  const next: Record<string, AttendanceStatus> = {};
  const sessionStarted = byStudent.size > 0;
  for (const student of students) {
    const marked = byStudent.get(student.id);
    if (marked) {
      next[student.id] = marked;
    } else if (sessionStarted) {
      next[student.id] = 'present';
    }
  }
  return next;
};

const countStatuses = (
  students: { id: string }[],
  data: Record<string, AttendanceStatus>
) => {
  const counts = { present: 0, absent: 0, late: 0, unmarked: 0 };
  for (const s of students) {
    const status = data[s.id];
    if (status) counts[status]++;
    else counts.unmarked++;
  }
  return counts;
};

describe('QuickAttendance status totals', () => {
  const students = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];

  it('reste non marqué quand aucun enregistrement du jour', () => {
    const map = buildStatusMap(students, []);
    expect(countStatuses(students, map)).toEqual({
      present: 0,
      absent: 0,
      late: 0,
      unmarked: 4,
    });
  });

  it('compte absents/retards et déduit les présents si un appel a déjà eu lieu', () => {
    const map = buildStatusMap(students, [
      { student_id: 'a', type: 'absence' },
      { student_id: 'b', type: 'lateness' },
    ]);
    expect(countStatuses(students, map)).toEqual({
      present: 2,
      absent: 1,
      late: 1,
      unmarked: 0,
    });
  });
});
