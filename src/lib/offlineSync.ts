import { apiClient } from './apiClient';
import { getPendingAttendance, removePendingAttendance, countPendingAttendance } from './offlineDb';

/**
 * Synchronisation des saisies d'appel prises hors ligne (PRS-003). Rejoue la
 * file d'attente IndexedDB via `POST /absences/bulk`, qui est idempotent
 * côté serveur sur `clientId` : rejouer un envoi déjà traité (ex. après une
 * coupure réseau juste après l'envoi précédent) ne crée jamais de doublon.
 */

let syncing = false;

export interface FlushResult {
  synced: number;
  remaining: number;
}

export const flushPendingAttendance = async (): Promise<FlushResult> => {
  if (syncing) {
    return { synced: 0, remaining: await countPendingAttendance() };
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { synced: 0, remaining: await countPendingAttendance() };
  }

  syncing = true;
  try {
    const pending = await getPendingAttendance();
    if (pending.length === 0) {
      return { synced: 0, remaining: 0 };
    }
    try {
      await apiClient.post('/absences/bulk', pending.map((item) => ({
        studentId: item.studentId,
        institutionId: item.institutionId,
        courseId: item.courseId,
        type: item.type,
        date: item.date,
        duration: item.duration,
        clientId: item.clientId,
      })));
      await removePendingAttendance(pending.map((p) => p.clientId));
      return { synced: pending.length, remaining: 0 };
    } catch (error) {
      console.error('Échec de synchronisation hors-ligne :', error);
      return { synced: 0, remaining: pending.length };
    }
  } finally {
    syncing = false;
  }
};

let registered = false;

/** Enregistre les déclencheurs de resynchronisation automatique (retour de
 * connexion + filet de sécurité périodique). Appelé une seule fois au
 * démarrage de l'application (`src/main.tsx`). */
export const registerOfflineSync = (): void => {
  if (registered || typeof window === 'undefined') return;
  registered = true;

  window.addEventListener('online', () => {
    void flushPendingAttendance();
  });

  // Filet de sécurité : l'événement 'online' n'est pas toujours fiable
  // (ex. connexion instable qui ne redéclenche pas l'événement) — une
  // tentative périodique reste inoffensive si la file est vide.
  setInterval(() => {
    void flushPendingAttendance();
  }, 60_000);

  // Tentative immédiate au chargement (ex. l'app redémarre alors que le
  // réseau était déjà revenu pendant qu'elle était fermée).
  void flushPendingAttendance();
};
