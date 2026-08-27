import { describe, it, expect } from 'vitest';
import { isDemoContactSubject, splitContactName } from '../lib/contactDemo.js';

describe('contactDemo helpers', () => {
  it('détecte les sujets démo / présentation / essai', () => {
    expect(isDemoContactSubject('Demande de démo')).toBe(true);
    expect(isDemoContactSubject('Demande de démonstration')).toBe(true);
    expect(isDemoContactSubject('Demande de présentation')).toBe(true);
    expect(isDemoContactSubject('essai gratuit')).toBe(true);
    expect(isDemoContactSubject('Question facturation')).toBe(false);
  });

  it('découpe le nom contact pour l’admin', () => {
    expect(splitContactName('Marie Kouassi')).toEqual({
      firstName: 'Marie',
      lastName: 'Kouassi',
    });
    expect(splitContactName('Alex')).toEqual({ firstName: 'Alex', lastName: 'Admin' });
  });
});
