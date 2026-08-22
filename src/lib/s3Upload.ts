import { apiClient } from '@/lib/apiClient';

/**
 * Upload navigateur → S3 via POST signé (DOC-005). Le fichier ne transite
 * pas par l'API CaddyNote ; `folder` doit être un dossier autorisé côté
 * `POST /files/presign-upload`.
 */
export const uploadViaPresignedPost = async (folder: string, file: File): Promise<string> => {
  const { key, url, fields } = await apiClient.post<{
    key: string;
    url: string;
    fields: Record<string, string>;
  }>('/files/presign-upload', {
    folder,
    filename: file.name,
    contentType: file.type || 'application/octet-stream',
  });

  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    form.append(name, value);
  }
  form.append('file', file);

  const uploaded = await fetch(url, { method: 'POST', body: form });
  if (!uploaded.ok) {
    throw new Error('Échec de l’envoi du fichier vers le stockage');
  }
  return key;
};
