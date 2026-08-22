import { describe, it, expect } from 'vitest';

/** Miroir de la logique attendanceToday du hook (test unitaire sans React). */
const attendanceToday = (studentCount: number, absentToday: number) => {
  if (studentCount === 0) return { rate: null as number | null, delta: null as number | null };
  const rate = Math.max(0, Math.min(100, ((studentCount - absentToday) / studentCount) * 100));
  return { rate, delta: null as number | null };
};

describe('establishment overview attendance', () => {
  it('retourne null (pas 0% inventé) quand aucun élève', () => {
    expect(attendanceToday(0, 0)).toEqual({ rate: null, delta: null });
  });

  it('calcule le taux réel sans faux delta', () => {
    expect(attendanceToday(10, 1)).toEqual({ rate: 90, delta: null });
  });
});
