import { describe, expect, it } from 'vitest';
import {
  centsToMajor,
  currencyDisplayLabel,
  formatCentsAmount,
  majorToCents,
  parseMajorAmountInput,
} from './money';

describe('parseMajorAmountInput', () => {
  it('accepte 12000 et 12 000', () => {
    expect(parseMajorAmountInput('12000')).toBe(12000);
    expect(parseMajorAmountInput('12 000')).toBe(12000);
    expect(parseMajorAmountInput('12\u202f000')).toBe(12000);
  });

  it('ne confond pas 12.000 (milliers FR) avec 12', () => {
    expect(parseMajorAmountInput('12.000')).toBe(12000);
    expect(Number('12.000')).toBe(12); // piège JS documenté
  });

  it('accepte 12,5 via virgule', () => {
    expect(parseMajorAmountInput('12,5')).toBe(12.5);
  });

  it('refuse les valeurs invalides', () => {
    expect(parseMajorAmountInput('')).toBeNull();
    expect(parseMajorAmountInput('abc')).toBeNull();
    expect(parseMajorAmountInput('-1')).toBeNull();
  });
});

describe('formatCentsAmount', () => {
  it('affiche 12 000 FCFA depuis 1_200_000 centimes', () => {
    expect(formatCentsAmount(1_200_000, 'XOF')).toMatch(/12[\s\u00a0\u202f]?000/);
    expect(formatCentsAmount(1_200_000, 'XOF')).toContain('FCFA');
  });

  it('n’affiche pas 12 pour un vrai montant de 12 000', () => {
    expect(formatCentsAmount(1_200_000, 'XOF')).not.toBe('12 FCFA');
    expect(formatCentsAmount(1_200_000, 'XOF')).not.toMatch(/^12 /);
  });
});

describe('majorToCents / centsToMajor', () => {
  it('round-trip 12000 FCFA', () => {
    expect(majorToCents(12000)).toBe(1_200_000);
    expect(centsToMajor(1_200_000)).toBe(12000);
  });
});

describe('currencyDisplayLabel', () => {
  it('mappe XOF/XAF vers FCFA', () => {
    expect(currencyDisplayLabel('XOF')).toBe('FCFA');
    expect(currencyDisplayLabel('XAF')).toBe('FCFA');
    expect(currencyDisplayLabel('EUR')).toBe('EUR');
  });
});
