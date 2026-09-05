import { describe, expect, it } from 'vitest';
import {
  filterPartnerNames,
  parseStoredPartners,
  sanitizePartnerNames,
} from './publicPartners.js';

describe('sanitizePartnerNames', () => {
  it('accepte une liste courte de noms', () => {
    const result = sanitizePartnerNames(['Lycée Horizon', 'École Verte']);
    expect(result).toEqual({ ok: true, names: ['Lycée Horizon', 'École Verte'] });
  });

  it('trim et dédoublonne sans tenir compte de la casse', () => {
    const result = sanitizePartnerNames(['  Campus Nord  ', 'campus nord', 'CAMPUS NORD']);
    expect(result).toEqual({ ok: true, names: ['Campus Nord'] });
  });

  it('accepte une liste vide', () => {
    expect(sanitizePartnerNames([])).toEqual({ ok: true, names: [] });
  });

  it('refuse plus de 12 noms', () => {
    const names = Array.from({ length: 13 }, (_, i) => `École ${i + 1}`);
    expect(sanitizePartnerNames(names).ok).toBe(false);
  });

  it('refuse URL, javascript:, data:, //, < et >', () => {
    for (const name of [
      'https://evil.example',
      'http://evil.example',
      'javascript:alert(1)',
      'data:text/html,x',
      '//evil.example',
      'École <script>',
      'École >',
    ]) {
      expect(sanitizePartnerNames([name]).ok).toBe(false);
    }
  });

  it('refuse un nom trop long ou vide', () => {
    expect(sanitizePartnerNames(['']).ok).toBe(false);
    expect(sanitizePartnerNames(['   ']).ok).toBe(false);
    expect(sanitizePartnerNames(['x'.repeat(81)]).ok).toBe(false);
  });

  it('refuse un tableau mal typé', () => {
    expect(sanitizePartnerNames(null).ok).toBe(false);
    expect(sanitizePartnerNames({ names: ['A'] }).ok).toBe(false);
    expect(sanitizePartnerNames([1]).ok).toBe(false);
  });
});

describe('filterPartnerNames / parseStoredPartners', () => {
  it('ignore les entrées invalides et plafonne à 12', () => {
    const mixed = [
      'Lycée Horizon',
      'https://evil.example',
      'École Verte',
      ...Array.from({ length: 20 }, (_, i) => `Campus ${i}`),
    ];
    const filtered = filterPartnerNames(mixed);
    expect(filtered[0]).toBe('Lycée Horizon');
    expect(filtered).not.toContain('https://evil.example');
    expect(filtered).toHaveLength(12);
  });

  it('lit { names } depuis un setting stocké', () => {
    expect(parseStoredPartners({ names: ['Institut Baobab', '<bad>'] })).toEqual(['Institut Baobab']);
    expect(parseStoredPartners(null)).toEqual([]);
    expect(parseStoredPartners('oops')).toEqual([]);
  });
});
