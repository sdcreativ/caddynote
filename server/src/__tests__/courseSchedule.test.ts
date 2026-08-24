import { describe, it, expect } from 'vitest';
import {
  addMinutesToHhMm,
  deriveScheduleFromCourseFields,
  normalizeTimeHhMm,
  parseScheduleDayToDayOfWeek,
} from '../lib/courseSchedule.js';

describe('courseSchedule helpers', () => {
  it('mappe les jours FR / EN vers dayOfWeek JS', () => {
    expect(parseScheduleDayToDayOfWeek('Lundi')).toBe(1);
    expect(parseScheduleDayToDayOfWeek('mercredi')).toBe(3);
    expect(parseScheduleDayToDayOfWeek('Dimanche')).toBe(0);
    expect(parseScheduleDayToDayOfWeek('2')).toBe(2);
    expect(parseScheduleDayToDayOfWeek('inconnu')).toBeNull();
  });

  it('normalise et additionne les heures', () => {
    expect(normalizeTimeHhMm('9:05')).toBe('09:05');
    expect(normalizeTimeHhMm('14:30:00')).toBe('14:30');
    expect(addMinutesToHhMm('08:00', 60)).toBe('09:00');
    expect(addMinutesToHhMm('23:30', 60)).toBeNull();
  });

  it('dérive un créneau depuis jour + heure + durée', () => {
    expect(
      deriveScheduleFromCourseFields({
        scheduleDay: 'Mardi',
        scheduleTime: '10:00',
        duration: 90,
      })
    ).toEqual({ dayOfWeek: 2, startTime: '10:00', endTime: '11:30' });
  });

  it('retourne null si aucun horaire', () => {
    expect(deriveScheduleFromCourseFields({})).toBeNull();
  });

  it('refuse un jour sans heure (et inversement)', () => {
    expect(() =>
      deriveScheduleFromCourseFields({ scheduleDay: 'Lundi', scheduleTime: '' })
    ).toThrow(/jour et l’heure/i);
  });
});
