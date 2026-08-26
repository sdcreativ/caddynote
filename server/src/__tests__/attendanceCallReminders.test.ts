import { describe, it, expect } from 'vitest';
import {
  filterUpcomingCalls,
  isWithinLeadWindow,
  minutesUntilSlotStart,
} from '../lib/attendanceCallReminders.js';

describe('attendanceCallReminders', () => {
  // Mercredi 15:50 local — 26 août 2026 est un mercredi
  const wed1550 = new Date(2026, 7, 26, 15, 50, 0);

  it('minutesUntilSlotStart calcule le délai le même jour', () => {
    expect(wed1550.getDay()).toBe(3);
    expect(minutesUntilSlotStart(wed1550, 3, '16:00')).toBe(10);
    expect(minutesUntilSlotStart(wed1550, 3, '15:50')).toBe(0);
    expect(minutesUntilSlotStart(wed1550, 3, '15:40')).toBe(-10);
    expect(minutesUntilSlotStart(wed1550, 2, '16:00')).toBeNull();
  });

  it('isWithinLeadWindow n’accepte que ]0, N]', () => {
    expect(isWithinLeadWindow(wed1550, 3, '16:00', 10)).toBe(true);
    expect(isWithinLeadWindow(wed1550, 3, '15:55', 10)).toBe(true);
    expect(isWithinLeadWindow(wed1550, 3, '15:50', 10)).toBe(false);
    expect(isWithinLeadWindow(wed1550, 3, '16:11', 10)).toBe(false);
  });

  it('filterUpcomingCalls trie et exclut les cours déjà appelés', () => {
    const calls = filterUpcomingCalls(
      [
        {
          courseId: 'c1',
          classId: 'cl1',
          courseName: 'Maths',
          className: '3ème',
          startTime: '16:00',
          scheduleId: 's1',
          dayOfWeek: 3,
        },
        {
          courseId: 'c2',
          classId: null,
          courseName: 'SVT',
          className: null,
          startTime: '15:55',
          scheduleId: null,
          dayOfWeek: 3,
        },
        {
          courseId: 'c3',
          classId: null,
          courseName: 'Déjà fait',
          className: null,
          startTime: '16:00',
          scheduleId: null,
          dayOfWeek: 3,
        },
      ],
      wed1550,
      10,
      new Set(['c3'])
    );
    expect(calls.map((c) => c.courseId)).toEqual(['c2', 'c1']);
    expect(calls[0].minutesUntilStart).toBe(5);
    expect(calls[1].minutesUntilStart).toBe(10);
  });
});
