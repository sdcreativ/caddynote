import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

/**
 * Stockage local (IndexedDB) pour le mode hors ligne de l'appel (PRS-003) :
 * - `rosters` : dernière liste d'élèves connue par classe, téléchargée
 *   pendant que le réseau est disponible, pour pouvoir faire l'appel même
 *   sans connexion.
 * - `pendingAttendance` : saisies d'appel effectuées hors ligne, en attente
 *   de synchronisation. Chaque entrée porte un `clientId` généré une seule
 *   fois côté client, envoyé tel quel au serveur (`POST /absences/bulk`) —
 *   c'est ce qui garantit qu'une resynchronisation après coupure réseau ne
 *   crée jamais de doublon, même si la requête précédente avait en fait
 *   réussi côté serveur sans que la réponse nous parvienne.
 */

export interface CachedRosterStudent {
  id: string;
  name: string;
  studentNumber: string;
}

interface CachedRoster {
  classId: string;
  students: CachedRosterStudent[];
  cachedAt: string;
}

export interface PendingAttendanceItem {
  clientId: string;
  studentId: string;
  institutionId: string;
  courseId?: string;
  type: 'absence' | 'lateness';
  date: string;
  duration: number;
  queuedAt: string;
}

interface OfflineDBSchema extends DBSchema {
  rosters: { key: string; value: CachedRoster };
  pendingAttendance: { key: string; value: PendingAttendanceItem };
}

const DB_NAME = 'caddynote-offline';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<OfflineDBSchema>> | null = null;

const getDb = (): Promise<IDBPDatabase<OfflineDBSchema>> => {
  if (!dbPromise) {
    dbPromise = openDB<OfflineDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('rosters')) {
          db.createObjectStore('rosters', { keyPath: 'classId' });
        }
        if (!db.objectStoreNames.contains('pendingAttendance')) {
          db.createObjectStore('pendingAttendance', { keyPath: 'clientId' });
        }
      },
    });
  }
  return dbPromise;
};

export const cacheRoster = async (classId: string, students: CachedRosterStudent[]): Promise<void> => {
  const db = await getDb();
  await db.put('rosters', { classId, students, cachedAt: new Date().toISOString() });
};

export const getCachedRoster = async (classId: string): Promise<CachedRoster | undefined> => {
  const db = await getDb();
  return db.get('rosters', classId);
};

export const queueAttendance = async (items: PendingAttendanceItem[]): Promise<void> => {
  const db = await getDb();
  const tx = db.transaction('pendingAttendance', 'readwrite');
  await Promise.all([...items.map((item) => tx.store.put(item)), tx.done]);
};

export const getPendingAttendance = async (): Promise<PendingAttendanceItem[]> => {
  const db = await getDb();
  return db.getAll('pendingAttendance');
};

export const removePendingAttendance = async (clientIds: string[]): Promise<void> => {
  const db = await getDb();
  const tx = db.transaction('pendingAttendance', 'readwrite');
  await Promise.all([...clientIds.map((id) => tx.store.delete(id)), tx.done]);
};

export const countPendingAttendance = async (): Promise<number> => {
  const db = await getDb();
  return db.count('pendingAttendance');
};
