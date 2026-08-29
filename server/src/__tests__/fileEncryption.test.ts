import { describe, it, expect, afterEach } from 'vitest';
import {
  encryptBuffer,
  decryptBuffer,
  isEncryptedPayload,
  isFileEncryptionRequired,
  assertFileEncryptionReady,
} from '../lib/fileEncryption.js';
import { getPilotReadiness } from '../lib/diagnostics.js';

describe('fileEncryption AES-256-GCM', () => {
  const prevKey = process.env.FILE_ENCRYPTION_KEY;
  const prevDeploy = process.env.CADDYNOTE_DEPLOYMENT;
  const prevTest = process.env.CADDYNOTE_TEST_MODE;

  afterEach(() => {
    if (prevKey === undefined) delete process.env.FILE_ENCRYPTION_KEY;
    else process.env.FILE_ENCRYPTION_KEY = prevKey;
    if (prevDeploy === undefined) delete process.env.CADDYNOTE_DEPLOYMENT;
    else process.env.CADDYNOTE_DEPLOYMENT = prevDeploy;
    if (prevTest === undefined) delete process.env.CADDYNOTE_TEST_MODE;
    else process.env.CADDYNOTE_TEST_MODE = prevTest;
  });

  it('chiffre et déchiffre avec FILE_ENCRYPTION_KEY', () => {
    process.env.FILE_ENCRYPTION_KEY = 'a'.repeat(64);
    const plain = Buffer.from('pièce confidentielle PDF');
    const enc = encryptBuffer(plain);
    expect(isEncryptedPayload(enc)).toBe(true);
    expect(enc.equals(plain)).toBe(false);
    expect(decryptBuffer(enc).toString()).toBe(plain.toString());
  });

  it('laisse passer le clair si aucune clé hors staging/prod', () => {
    delete process.env.FILE_ENCRYPTION_KEY;
    delete process.env.CADDYNOTE_DEPLOYMENT;
    delete process.env.CADDYNOTE_TEST_MODE;
    expect(isFileEncryptionRequired()).toBe(false);
    const plain = Buffer.from('sans clé');
    expect(encryptBuffer(plain).equals(plain)).toBe(true);
  });

  it('exige la clé en staging et refuse encrypt sans clé', () => {
    delete process.env.FILE_ENCRYPTION_KEY;
    process.env.CADDYNOTE_DEPLOYMENT = 'staging';
    process.env.CADDYNOTE_TEST_MODE = 'false';
    expect(isFileEncryptionRequired()).toBe(true);
    expect(() => assertFileEncryptionReady()).toThrow(/FILE_ENCRYPTION_KEY/);
    expect(() => encryptBuffer(Buffer.from('x'))).toThrow(/FILE_ENCRYPTION_KEY/);
  });

  it('assertFileEncryptionReady OK quand la clé est posée', () => {
    process.env.CADDYNOTE_DEPLOYMENT = 'staging';
    process.env.CADDYNOTE_TEST_MODE = 'false';
    process.env.FILE_ENCRYPTION_KEY = 'b'.repeat(64);
    expect(() => assertFileEncryptionReady()).not.toThrow();
  });

  it('getPilotReadiness bloque staging sans FILE_ENCRYPTION_KEY', () => {
    delete process.env.FILE_ENCRYPTION_KEY;
    process.env.CADDYNOTE_DEPLOYMENT = 'staging';
    process.env.CADDYNOTE_TEST_MODE = 'false';
    const pilot = getPilotReadiness();
    expect(pilot.ready).toBe(false);
    expect(pilot.blockers.some((b) => /FILE_ENCRYPTION_KEY/i.test(b))).toBe(true);
    expect(pilot.warnings.some((w) => /HTTPS/i.test(w))).toBe(true);
  });
});
