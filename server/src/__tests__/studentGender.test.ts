import { describe, expect, it } from 'vitest';
import { parseStudentGender, tallyGender } from '../lib/studentGender.js';

describe('parseStudentGender', () => {
  it('accepte fille / female', () => {
    expect(parseStudentGender('fille')).toBe('female');
    expect(parseStudentGender('female')).toBe('female');
    expect(parseStudentGender('F')).toBe('female');
  });

  it('accepte garçon / male', () => {
    expect(parseStudentGender('garçon')).toBe('male');
    expect(parseStudentGender('garcon')).toBe('male');
    expect(parseStudentGender('male')).toBe('male');
  });

  it('rejette les valeurs inconnues', () => {
    expect(parseStudentGender('')).toBeNull();
    expect(parseStudentGender('autre')).toBeNull();
    expect(parseStudentGender(null)).toBeNull();
  });
});

describe('tallyGender', () => {
  it('compte filles, garçons et inconnus', () => {
    expect(tallyGender(['female', 'male', 'female', null, 'other'])).toEqual({
      female: 2,
      male: 1,
      unknown: 2,
      total: 5,
    });
  });
});
