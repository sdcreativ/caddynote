import { describe, it, expect } from 'vitest';
import { encryptBuffer, decryptBuffer, isEncryptedPayload } from '../lib/fileEncryption.js';

describe('fileEncryption AES-256-GCM', () => {
  it('chiffre et déchiffre avec FILE_ENCRYPTION_KEY', () => {
    const prev = process.env.FILE_ENCRYPTION_KEY;
    process.env.FILE_ENCRYPTION_KEY = 'a'.repeat(64);
    try {
      const plain = Buffer.from('pièce confidentielle PDF');
      const enc = encryptBuffer(plain);
      expect(isEncryptedPayload(enc)).toBe(true);
      expect(enc.equals(plain)).toBe(false);
      const back = decryptBuffer(enc);
      expect(back.toString()).toBe(plain.toString());
    } finally {
      if (prev === undefined) delete process.env.FILE_ENCRYPTION_KEY;
      else process.env.FILE_ENCRYPTION_KEY = prev;
    }
  });

  it('laisse passer le clair si aucune clé', () => {
    const prev = process.env.FILE_ENCRYPTION_KEY;
    delete process.env.FILE_ENCRYPTION_KEY;
    try {
      const plain = Buffer.from('sans clé');
      expect(encryptBuffer(plain).equals(plain)).toBe(true);
    } finally {
      if (prev !== undefined) process.env.FILE_ENCRYPTION_KEY = prev;
    }
  });
});
