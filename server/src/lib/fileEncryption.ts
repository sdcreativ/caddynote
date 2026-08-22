/**
 * Chiffrement at-rest applicatif (AES-256-GCM) pour les objets stockés.
 *
 * Format binaire : magic `CNENC1` (6) + IV (12) + authTag (16) + ciphertext.
 * Clé : FILE_ENCRYPTION_KEY (64 hex = 32 octets, ou base64 32 octets).
 * Si la clé est absente : pas de chiffrement applicatif (compatibilité).
 *
 * Complément infra S3 : S3_SSE=AES256|aws:kms (+ S3_SSE_KMS_KEY_ID).
 */
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';

const MAGIC = Buffer.from('CNENC1');
const IV_LEN = 12;
const TAG_LEN = 16;

export const isFileEncryptionConfigured = (): boolean => !!resolveKey();

const resolveKey = (): Buffer | null => {
  const raw = process.env.FILE_ENCRYPTION_KEY?.trim();
  if (!raw) return null;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
  try {
    const b64 = Buffer.from(raw, 'base64');
    if (b64.length === 32) return b64;
  } catch {
    /* ignore */
  }
  // Dérivation déterministe si une phrase est fournie (dev uniquement — documenter en prod d’utiliser 32 octets).
  return createHash('sha256').update(raw).digest();
};

export const encryptBuffer = (plain: Buffer): Buffer => {
  const key = resolveKey();
  if (!key) return plain;
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([MAGIC, iv, tag, encrypted]);
};

export const decryptBuffer = (stored: Buffer): Buffer => {
  if (stored.length < MAGIC.length + IV_LEN + TAG_LEN) return stored;
  if (!stored.subarray(0, MAGIC.length).equals(MAGIC)) return stored;
  const key = resolveKey();
  if (!key) {
    throw new Error('Objet chiffré mais FILE_ENCRYPTION_KEY absente');
  }
  const iv = stored.subarray(MAGIC.length, MAGIC.length + IV_LEN);
  const tag = stored.subarray(MAGIC.length + IV_LEN, MAGIC.length + IV_LEN + TAG_LEN);
  const data = stored.subarray(MAGIC.length + IV_LEN + TAG_LEN);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]);
};

export const isEncryptedPayload = (stored: Buffer): boolean =>
  stored.length >= MAGIC.length && stored.subarray(0, MAGIC.length).equals(MAGIC);
