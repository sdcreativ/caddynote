import { describe, it, expect } from 'vitest';
import { currentSchoolYear } from './schoolYear';

describe('currentSchoolYear', () => {
  it('retourne N/N+1 en septembre', () => {
    expect(currentSchoolYear(new Date('2026-09-03'))).toBe('2026-2027');
  });

  it('retourne N/N+1 en décembre', () => {
    expect(currentSchoolYear(new Date('2026-12-15'))).toBe('2026-2027');
  });

  it('retourne (N-1)/N en janvier', () => {
    expect(currentSchoolYear(new Date('2027-01-10'))).toBe('2026-2027');
  });

  it('retourne (N-1)/N en août', () => {
    expect(currentSchoolYear(new Date('2027-08-31'))).toBe('2026-2027');
  });

  it('passe automatiquement en septembre suivant', () => {
    expect(currentSchoolYear(new Date('2027-09-01'))).toBe('2027-2028');
  });
});
