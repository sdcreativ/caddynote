import { apiClient, getToken, ApiError } from '@/lib/apiClient';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

const EXT_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

/** Type MIME fiable : `File.type` est parfois vide (PDF sous certains OS). */
export const inferUploadContentType = (file: File): string => {
  if (file.type && file.type !== 'application/octet-stream') return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  return EXT_MIME[ext] || file.type || 'application/octet-stream';
};

const uploadViaDirectApi = async (key: string, uploadPath: string, file: File, contentType: string) => {
  const token = getToken();
  const uploaded = await fetch(`${API_BASE_URL}${uploadPath}`, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
      'X-Object-Key': key,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: file,
  });
  if (!uploaded.ok) {
    const errBody = await uploaded.json().catch(() => null);
    throw new ApiError(
      (errBody as { error?: string } | null)?.error || 'Échec de l’envoi du fichier',
      uploaded.status
    );
  }
};

/**
 * Upload navigateur → stockage (DOC-005).
 * 1) POST signé S3 si proposé ;
 * 2) sinon / en secours : PUT `/files/direct-upload` (local ou S3 côté API).
 */
export const uploadViaPresignedPost = async (folder: string, file: File): Promise<string> => {
  const contentType = inferUploadContentType(file);
  const presign = await apiClient.post<{
    mode?: 's3' | 'local';
    key: string;
    url?: string;
    fields?: Record<string, string>;
    uploadPath?: string;
  }>('/files/presign-upload', {
    folder,
    filename: file.name,
    contentType,
  });

  if (presign.mode === 'local' || (!presign.url && !presign.fields)) {
    if (!presign.uploadPath) throw new Error('Réponse d’upload invalide (chemin manquant)');
    await uploadViaDirectApi(presign.key, presign.uploadPath, file, contentType);
    return presign.key;
  }

  if (!presign.url || !presign.fields) {
    throw new Error('Réponse d’upload invalide');
  }

  try {
    const form = new FormData();
    for (const [name, value] of Object.entries(presign.fields)) {
      form.append(name, value);
    }
    form.append('file', file);
    const uploaded = await fetch(presign.url, { method: 'POST', body: form });
    if (!uploaded.ok) {
      throw new Error('Échec de l’envoi du fichier vers le stockage');
    }
    return presign.key;
  } catch (err) {
    // Repli CORS / S3 inaccessible : même clé via l’API.
    if (presign.uploadPath) {
      await uploadViaDirectApi(presign.key, presign.uploadPath, file, contentType);
      return presign.key;
    }
    throw err;
  }
};
