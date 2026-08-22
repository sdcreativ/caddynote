import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Stockage fichiers local (dev / instances sans S3).
 * Clés identiques au schéma S3 (`admissions/inst-…/…`) pour bascule transparente.
 *
 * Répertoire : LOCAL_UPLOAD_DIR ou `server/uploads` (gitignoré).
 */

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(moduleDir, '../../uploads');

export const getLocalUploadRoot = (): string => {
  const fromEnv = process.env.LOCAL_UPLOAD_DIR?.trim();
  return fromEnv ? path.resolve(fromEnv) : defaultRoot;
};

const assertSafeKey = (key: string): string => {
  if (!key || key.includes('\0') || key.startsWith('/') || key.includes('..')) {
    throw new Error('Clé de fichier invalide');
  }
  const normalized = path.posix.normalize(key);
  if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
    throw new Error('Clé de fichier invalide');
  }
  return normalized;
};

export const resolveLocalObjectPath = (key: string): string => {
  const safeKey = assertSafeKey(key);
  const root = getLocalUploadRoot();
  const full = path.resolve(root, safeKey);
  if (!full.startsWith(root + path.sep) && full !== root) {
    throw new Error('Chemin hors du répertoire d’upload');
  }
  return full;
};

export const putLocalObject = async (key: string, body: Buffer): Promise<void> => {
  const full = resolveLocalObjectPath(key);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, body, { flag: 'wx' }).catch(async (err: NodeJS.ErrnoException) => {
    if (err.code === 'EEXIST') {
      await fs.writeFile(full, body);
      return;
    }
    throw err;
  });
};

export const getLocalObjectBytes = async (key: string): Promise<Buffer> => {
  const full = resolveLocalObjectPath(key);
  return fs.readFile(full);
};

export const deleteLocalObject = async (key: string): Promise<void> => {
  const full = resolveLocalObjectPath(key);
  await fs.unlink(full).catch(() => {});
};

export const localObjectExists = async (key: string): Promise<boolean> => {
  try {
    await fs.access(resolveLocalObjectPath(key));
    return true;
  } catch {
    return false;
  }
};
