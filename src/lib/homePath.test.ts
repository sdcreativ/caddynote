import { describe, expect, it } from 'vitest';
import { homePathForRole } from './homePath';

describe('homePathForRole', () => {
  it('envoie l’élève vers /my-suivi (maquette Suivi)', () => {
    expect(homePathForRole('student')).toBe('/my-suivi');
  });

  it('conserve /dashboard pour les autres rôles', () => {
    expect(homePathForRole('parent')).toBe('/dashboard');
    expect(homePathForRole('teacher')).toBe('/dashboard');
    expect(homePathForRole(null)).toBe('/dashboard');
  });
});
