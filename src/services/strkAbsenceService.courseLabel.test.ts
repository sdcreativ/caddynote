import { describe, it, expect } from 'vitest';
import {
  cleanAbsenceLabel,
  formatAbsenceCourseLabel,
  mapApiAbsence,
} from '@/services/strkAbsenceService';

describe('libellé cours des absences', () => {
  it('n’affiche jamais un UUID comme nom de cours', () => {
    expect(cleanAbsenceLabel('da5edddc-1102-490a-b1b6-5c002cdff0ae')).toBeUndefined();
    expect(cleanAbsenceLabel('Mathématiques')).toBe('Mathématiques');
  });

  it('mappe courseName vers course_name (pas le courseId)', () => {
    const mapped = mapApiAbsence({
      id: 'a1',
      studentId: 's1',
      institutionId: 'i1',
      type: 'lateness',
      date: '2026-08-25',
      duration: 15,
      justified: false,
      justificationStatus: 'none',
      courseId: 'da5edddc-1102-490a-b1b6-5c002cdff0ae',
      courseName: 'Anglais 5e',
      className: 'Ma classe',
      createdAt: '2026-08-25T10:00:00.000Z',
      updatedAt: '2026-08-25T10:00:00.000Z',
    });
    expect(mapped.course_name).toBe('Anglais 5e');
    expect(mapped.class_name).toBe('Ma classe');
    expect(mapped.course_id).toBe('da5edddc-1102-490a-b1b6-5c002cdff0ae');
    expect(formatAbsenceCourseLabel(mapped)).toBe('Anglais 5e');
  });

  it('ne retombe pas sur le courseId si le nom de cours est absent', () => {
    const mapped = mapApiAbsence({
      id: 'a2',
      studentId: 's1',
      institutionId: 'i1',
      type: 'absence',
      date: '2026-08-25',
      duration: 60,
      justified: false,
      justificationStatus: 'none',
      courseId: 'da5edddc-1102-490a-b1b6-5c002cdff0ae',
      courseName: null,
      className: 'Ma classe',
      createdAt: '2026-08-25T10:00:00.000Z',
      updatedAt: '2026-08-25T10:00:00.000Z',
    });
    expect(mapped.course_name).toBeUndefined();
    expect(mapped.class_name).toBe('Ma classe');
    expect(formatAbsenceCourseLabel(mapped)).toBe('Ma classe');
  });
});
