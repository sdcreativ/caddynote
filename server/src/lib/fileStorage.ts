import {
  isS3Configured,
  getObjectBytes as getS3ObjectBytes,
  deleteObject as deleteS3Object,
} from './s3.js';
import { deleteLocalObject, getLocalObjectBytes, putLocalObject } from './localFiles.js';
import { decryptBuffer, encryptBuffer, isFileEncryptionConfigured } from './fileEncryption.js';

/**
 * Façade stockage : S3 si configuré, sinon disque local (dev / défaut).
 * Chiffrement at-rest applicatif transparent si FILE_ENCRYPTION_KEY est défini.
 */

export type FileStorageMode = 's3' | 'local';

export const getFileStorageMode = (): FileStorageMode => (isS3Configured() ? 's3' : 'local');

/** Toujours vrai : repli local si S3 absent. */
export const isFileStorageAvailable = (): boolean => true;

export const isAtRestEncryptionEnabled = (): boolean => isFileEncryptionConfigured();

export const putStoredObject = async (key: string, body: Buffer, contentType: string): Promise<void> => {
  const payload = encryptBuffer(body);
  if (isS3Configured()) {
    const { uploadObject } = await import('./s3.js');
    await uploadObject(key, payload, contentType);
    return;
  }
  await putLocalObject(key, payload);
};

export const getStoredObjectBytes = async (key: string): Promise<Buffer> => {
  const raw = isS3Configured() ? await getS3ObjectBytes(key) : await getLocalObjectBytes(key);
  return decryptBuffer(raw);
};

/**
 * Ré-écrit un objet déjà présent (ex. upload navigateur S3 en clair)
 * sous forme chiffrée si le chiffrement applicatif est actif.
 */
export const ensureStoredObjectEncrypted = async (key: string, contentType = 'application/octet-stream'): Promise<void> => {
  if (!isFileEncryptionConfigured()) return;
  const raw = isS3Configured() ? await getS3ObjectBytes(key) : await getLocalObjectBytes(key);
  const { isEncryptedPayload } = await import('./fileEncryption.js');
  if (isEncryptedPayload(raw)) return;
  await putStoredObject(key, raw, contentType);
};

export const deleteStoredObject = async (key: string): Promise<void> => {
  if (isS3Configured()) {
    await deleteS3Object(key);
    return;
  }
  await deleteLocalObject(key);
};
