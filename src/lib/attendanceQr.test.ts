import { describe, it, expect } from 'vitest';
import { extractStudentId } from '@/lib/attendanceQr';

const SAMPLE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

describe('extractStudentId (scanner QR présence)', () => {
  it('extrait l’UUID depuis le préfixe caddynote:student:', () => {
    expect(extractStudentId(`caddynote:student:${SAMPLE_ID}`)).toBe(SAMPLE_ID);
  });

  it('accepte le préfixe en majuscules', () => {
    expect(extractStudentId(`CADDYNOTE:STUDENT:${SAMPLE_ID}`)).toBe(SAMPLE_ID);
  });

  it('accepte un UUID nu', () => {
    expect(extractStudentId(SAMPLE_ID)).toBe(SAMPLE_ID);
  });

  it('extrait un UUID embarqué dans un texte', () => {
    expect(extractStudentId(`élève=${SAMPLE_ID};ok`)).toBe(SAMPLE_ID);
  });

  it('retourne null si aucun identifiant valide', () => {
    expect(extractStudentId('')).toBeNull();
    expect(extractStudentId('pas-un-uuid')).toBeNull();
    expect(extractStudentId('caddynote:student:invalid')).toBeNull();
  });
});
