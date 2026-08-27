import { describe, it, expect } from 'vitest';
import {
  formatSessionHeading,
  formatSessionTimeRange,
  groupAttendanceBySession,
} from './attendanceSessionGroups';
import type { StrkAttendance } from '@/services/strkAttendanceService';

const base = (partial: Partial<StrkAttendance> & Pick<StrkAttendance, 'id' | 'student_id'>): StrkAttendance => ({
  institution_id: 'i1',
  date: '2026-08-20',
  type: 'absence',
  duration: 60,
  ...partial,
});

describe('groupAttendanceBySession', () => {
  it('regroupe les élèves d’une même séance (cours + date + horaire)', () => {
    const groups = groupAttendanceBySession([
      base({
        id: 'a1',
        student_id: 's1',
        student_name: 'Awa Koné',
        course_id: 'c1',
        course_name: 'Maths',
        class_name: '1ère',
        start_time: '08:00',
        end_time: '09:00',
        teacher_name: 'Mme Diop',
        type: 'absence',
      }),
      base({
        id: 'a2',
        student_id: 's2',
        student_name: 'Jean Dupont',
        course_id: 'c1',
        course_name: 'Maths',
        class_name: '1ère',
        start_time: '08:00',
        end_time: '09:00',
        teacher_name: 'Mme Diop',
        type: 'lateness',
        duration: 10,
      }),
      base({
        id: 'a3',
        student_id: 's3',
        student_name: 'Fatou Sarr',
        course_id: 'c2',
        course_name: 'Histoire',
        date: '2026-08-19',
        start_time: '10:00',
        end_time: '11:00',
        recorded_by_name: 'M. Fall',
        type: 'absence',
      }),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0].courseName).toBe('Maths');
    expect(groups[0].date).toBe('2026-08-20');
    expect(groups[0].absentCount).toBe(1);
    expect(groups[0].lateCount).toBe(1);
    expect(groups[0].records.map((r) => r.student_name)).toEqual(['Awa Koné', 'Jean Dupont']);
    expect(groups[1].courseName).toBe('Histoire');
    expect(groups[1].teacherName).toBe('M. Fall');
  });

  it('trie les séances du plus récent au plus ancien', () => {
    const groups = groupAttendanceBySession([
      base({
        id: 'old',
        student_id: 's1',
        date: '2026-08-10',
        course_id: 'c1',
        course_name: 'Ancien',
      }),
      base({
        id: 'new',
        student_id: 's1',
        date: '2026-08-25',
        course_id: 'c1',
        course_name: 'Récent',
      }),
    ]);
    expect(groups.map((g) => g.courseName)).toEqual(['Récent', 'Ancien']);
  });

  it('sépare deux appels le même jour pour le même cours si les auteurs diffèrent', () => {
    const groups = groupAttendanceBySession([
      base({
        id: 'a1',
        student_id: 's1',
        course_id: 'c1',
        course_name: 'Maths',
        start_time: '08:00',
        created_by: 'teacher-1',
        recorded_by_name: 'Mme A',
      }),
      base({
        id: 'a2',
        student_id: 's2',
        course_id: 'c1',
        course_name: 'Maths',
        start_time: '08:00',
        created_by: 'teacher-2',
        recorded_by_name: 'M. B',
      }),
    ]);
    expect(groups).toHaveLength(2);
  });
});

describe('formatSessionHeading', () => {
  it('compose matière · classe · date · horaire · prof', () => {
    const heading = formatSessionHeading({
      key: 'k',
      date: '2026-08-20',
      courseName: 'Maths',
      className: '1ère',
      startTime: '08:00',
      endTime: '09:00',
      teacherName: 'Mme Diop',
      records: [],
      absentCount: 0,
      lateCount: 0,
    });
    expect(heading).toContain('Maths');
    expect(heading).toContain('1ère');
    expect(heading).toContain('08:00–09:00');
    expect(heading).toContain('Prof. Mme Diop');
  });
});

describe('formatSessionTimeRange', () => {
  it('affiche la plage ou le début seul', () => {
    expect(formatSessionTimeRange('08:00', '09:00')).toBe('08:00–09:00');
    expect(formatSessionTimeRange('08:00')).toBe('08:00');
    expect(formatSessionTimeRange()).toBeUndefined();
  });
});

describe('filterAttendanceByPeriod', () => {
  it('garde les enregistrements dans la fenêtre (30 jours)', async () => {
    const { filterAttendanceByPeriod } = await import('./attendanceSessionGroups');
    const now = new Date(2026, 7, 27); // 27 août 2026
    const filtered = filterAttendanceByPeriod(
      [
        base({ id: 'in', student_id: 's1', date: '2026-08-20' }),
        base({ id: 'out', student_id: 's1', date: '2026-07-01' }),
      ],
      '30d',
      now
    );
    expect(filtered.map((r) => r.id)).toEqual(['in']);
  });

  it('ne filtre pas en période all', async () => {
    const { filterAttendanceByPeriod } = await import('./attendanceSessionGroups');
    const records = [
      base({ id: 'a', student_id: 's1', date: '2025-01-01' }),
      base({ id: 'b', student_id: 's1', date: '2026-08-20' }),
    ];
    expect(filterAttendanceByPeriod(records, 'all')).toHaveLength(2);
  });
});
