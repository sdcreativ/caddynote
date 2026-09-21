import { describe, expect, it } from 'vitest';
import {
  PUBLIC_HOSTING,
  formatLegalFooterLine,
  formatPublisherIdentity,
  parseHosting,
} from './publicLegal';

const sample = {
  companyName: 'SD CREATIV',
  legalForm: 'SARL',
  shareCapital: '10 000 000 FCFA',
  registeredAddress: 'Cité SICOGI 1001 Logements, rue L 129, Angré - Abidjan',
  rccm: 'CI-ABJ-2024-B-12345',
  ncc: '0123456789A',
};

describe('publicLegal', () => {
  it('n’affiche rien tant que l’identité n’est pas saisie', () => {
    expect(
      formatPublisherIdentity({
        companyName: '',
        legalForm: '',
        shareCapital: '',
        registeredAddress: '',
        rccm: '',
        ncc: '',
      })
    ).toEqual([]);
  });

  it('compose l’identité éditeur et la ligne footer avec Hostinger', () => {
    expect(formatPublisherIdentity(sample)[0]).toBe('SD CREATIV, SARL, capital 10 000 000 FCFA');
    const line = formatLegalFooterLine(sample);
    expect(line).toContain('RCCM : CI-ABJ-2024-B-12345');
    expect(line).toContain(PUBLIC_HOSTING.legalName);
    expect(line).toContain('Larnaca');
  });

  it('retombe sur Hostinger si l’API omet l’hébergeur', () => {
    expect(parseHosting(null)).toEqual(PUBLIC_HOSTING);
    expect(parseHosting({ legalName: '', address: '' })).toEqual(PUBLIC_HOSTING);
  });
});
