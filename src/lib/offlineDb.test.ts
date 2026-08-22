import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import {
  cacheRoster,
  getCachedRoster,
  queueAttendance,
  getPendingAttendance,
  removePendingAttendance,
  countPendingAttendance,
} from './offlineDb';

// PRS-003 — file d'attente hors ligne. jsdom n'a pas d'IndexedDB natif ;
// `fake-indexeddb/auto` fournit une implémentation en mémoire suffisante
// pour vérifier le contrat de ce module sans navigateur réel.
describe('offlineDb', () => {
  it('met en cache puis récupère la liste d’élèves d’une classe', async () => {
    await cacheRoster('class-1', [{ id: 's1', name: 'Alice Martin', studentNumber: 'A1' }]);
    const roster = await getCachedRoster('class-1');
    expect(roster?.students).toHaveLength(1);
    expect(roster?.students[0].name).toBe('Alice Martin');
  });

  it('renvoie undefined pour une classe jamais mise en cache', async () => {
    const roster = await getCachedRoster('classe-inconnue');
    expect(roster).toBeUndefined();
  });

  it('met en file puis liste les saisies d’appel en attente de synchronisation', async () => {
    await queueAttendance([
      {
        clientId: 'client-1',
        studentId: 's1',
        institutionId: 'inst-1',
        type: 'absence',
        date: '2026-01-01',
        duration: 60,
        queuedAt: new Date().toISOString(),
      },
    ]);
    const pending = await getPendingAttendance();
    expect(pending.some((p) => p.clientId === 'client-1')).toBe(true);
    expect(await countPendingAttendance()).toBeGreaterThanOrEqual(1);
  });

  it('retire de la file les saisies confirmées synchronisées', async () => {
    await queueAttendance([
      {
        clientId: 'client-2',
        studentId: 's2',
        institutionId: 'inst-1',
        type: 'lateness',
        date: '2026-01-02',
        duration: 15,
        queuedAt: new Date().toISOString(),
      },
    ]);
    await removePendingAttendance(['client-2']);
    const pending = await getPendingAttendance();
    expect(pending.some((p) => p.clientId === 'client-2')).toBe(false);
  });
});
