import { describe, expect, it } from 'vitest';
import { presenceTodayFromAbsences } from './presenceToday';

describe('presenceTodayFromAbsences', () => {
  const noon = new Date('2026-09-01T12:00:00');

  it('présent quand aucune absence du jour', () => {
    expect(
      presenceTodayFromAbsences(
        [{ type: 'absence', date: '2026-08-31', created_at: '2026-08-31T08:00:00Z' }],
        noon
      )
    ).toEqual({ kind: 'present' });
  });

  it('absent si absence du jour', () => {
    const r = presenceTodayFromAbsences(
      [{ type: 'absence', date: '2026-09-01', created_at: '2026-09-01T07:55:00Z', start_time: '07:55' }],
      noon
    );
    expect(r.kind).toBe('absent');
    expect(r.timeLabel).toBe('07:55');
  });

  it('retard priorise lateness', () => {
    const r = presenceTodayFromAbsences(
      [{ type: 'lateness', date: '2026-09-01T00:00:00.000Z', created_at: '2026-09-01T08:12:00Z' }],
      noon
    );
    expect(r.kind).toBe('late');
  });
});
