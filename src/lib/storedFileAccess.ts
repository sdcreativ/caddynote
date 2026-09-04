/**
 * Ouverture d’un fichier stocké (S3 signé ou contenu authentifié / déchiffré).
 */
import { apiClient, authorizedFetch, ApiError } from '@/lib/apiClient';

export type StoredFileDownloadMeta = {
  mode?: 's3' | 'local';
  downloadUrl?: string;
  downloadPath?: string;
  expiresIn?: number;
};

/** Demande une URL ou un chemin de téléchargement pour une clé objet. */
export const requestStoredFileDownload = async (key: string): Promise<StoredFileDownloadMeta> =>
  apiClient.post<StoredFileDownloadMeta>('/files/presign-download', { key });

/**
 * Ouvre le fichier dans un nouvel onglet.
 * - S3 sans chiffrement applicatif : URL signée
 * - Local / chiffrement : fetch cookie HttpOnly puis blob URL
 */
export const openStoredFile = async (meta: StoredFileDownloadMeta): Promise<void> => {
  if (meta.downloadUrl) {
    window.open(meta.downloadUrl, '_blank', 'noopener,noreferrer');
    return;
  }
  if (!meta.downloadPath) {
    throw new Error('Réponse de téléchargement invalide');
  }

  const res = await authorizedFetch(meta.downloadPath);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(
      (body as { error?: string } | null)?.error || 'Impossible d’ouvrir le fichier',
      res.status
    );
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
};

/** Récupère une URL affichable (img src) — blob URL si besoin d’auth. */
export const resolveStoredFileDisplayUrl = async (key: string): Promise<string> => {
  const meta = await requestStoredFileDownload(key);
  if (meta.downloadUrl) return meta.downloadUrl;
  if (!meta.downloadPath) throw new Error('Réponse de téléchargement invalide');

  const res = await authorizedFetch(meta.downloadPath);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(
      (body as { error?: string } | null)?.error || 'Impossible de charger le fichier',
      res.status
    );
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
};
