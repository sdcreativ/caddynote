import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { queueAttendance, getPendingAttendance } from './offlineDb';
import { flushPendingAttendance } from './offlineSync';
import { clearToken } from './apiClient';

const setOnline = (value: boolean) => {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true });
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('offlineSync — flushPendingAttendance', () => {
  beforeEach(() => {
    clearToken();
    setOnline(true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('ne tente rien hors ligne, la file reste intacte', async () => {
    setOnline(false);
    await queueAttendance([
      {
        clientId: `offline-${Date.now()}`,
        studentId: 's1',
        institutionId: 'inst-1',
        type: 'absence',
        date: '2026-01-01',
        duration: 60,
        queuedAt: new Date().toISOString(),
      },
    ]);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await flushPendingAttendance();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.remaining).toBeGreaterThanOrEqual(1);
  });

  it('synchronise la file en ligne puis la vide', async () => {
    const clientId = `online-${Date.now()}`;
    await queueAttendance([
      {
        clientId,
        studentId: 's2',
        institutionId: 'inst-1',
        type: 'lateness',
        date: '2026-01-02',
        duration: 15,
        queuedAt: new Date().toISOString(),
      },
    ]);
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ absences: [] }, 201));
    vi.stubGlobal('fetch', fetchMock);

    const result = await flushPendingAttendance();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/absences/bulk');
    const body = JSON.parse(init.body as string);
    expect(body.some((item: { clientId: string }) => item.clientId === clientId)).toBe(true);
    expect(result.synced).toBeGreaterThanOrEqual(1);

    const pending = await getPendingAttendance();
    expect(pending.some((p) => p.clientId === clientId)).toBe(false);
  });

  it('garde la file intacte si la synchronisation échoue', async () => {
    const clientId = `fail-${Date.now()}`;
    await queueAttendance([
      {
        clientId,
        studentId: 's3',
        institutionId: 'inst-1',
        type: 'absence',
        date: '2026-01-03',
        duration: 60,
        queuedAt: new Date().toISOString(),
      },
    ]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'Erreur serveur' }, 500)));

    const result = await flushPendingAttendance();
    expect(result.synced).toBe(0);
    const pending = await getPendingAttendance();
    expect(pending.some((p) => p.clientId === clientId)).toBe(true);
  });
});
