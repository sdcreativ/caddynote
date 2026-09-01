import { describe, expect, it } from 'vitest';
import { homePathForRole } from './homePath';

describe('homePathForRole', () => {
  it('envoie l’élève vers /dashboard (Accueil)', () => {
    expect(homePathForRole('student')).toBe('/dashboard');
  });

  it('conserve /dashboard pour les autres rôles', () => {
    expect(homePathForRole('parent')).toBe('/dashboard');
    expect(homePathForRole('teacher')).toBe('/dashboard');
    expect(homePathForRole(null)).toBe('/dashboard');
  });
});
