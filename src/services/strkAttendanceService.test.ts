import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setToken, clearToken } from '@/lib/apiClient';
import { CacheService } from '@/services/cacheService';
import { fetchStudentsByClass, invalidateClassRoster } from './strkAttendanceService';

/**
 * NFR-004 — "liste d'appel en cache <2s". `cacheService`/`performanceService`
 * existaient déjà dans le projet mais n'étaient appliqués nulle part à la
 * liste d'appel réelle (`fetchStudentsByClass`, consommée par `/attendance`
 * et par le dialogue "Faire l'appel" de `/teacher-attendance`, corrigé au
 * passage — il ne chargeait jusqu'ici jamais de vrais élèves). Cette suite
 * vérifie le contrat de cache réellement branché : un second appel dans la
 * fenêtre de validité ne refait pas de requête réseau.
 */
const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

const apiStudents = (ids: string[]) => ({
  students: ids.map((id) => ({
    id,
    studentNumber: null,
    profile: { firstName: 'Prénom', lastName: id },
  })),
});

describe('strkAttendanceService — cache de la liste d’appel (NFR-004)', () => {
  beforeEach(() => {
    setToken('test-token');
    CacheService.clear();
  });

  afterEach(() => {
    clearToken();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('un second appel pour la même classe, dans la fenêtre de cache, ne refait pas de requête réseau', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(apiStudents(['s1', 's2'])));
    vi.stubGlobal('fetch', fetchMock);

    const first = await fetchStudentsByClass('class-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first).toHaveLength(2);
    expect(fetchMock.mock.calls[0][0]).toContain('/classes/class-1/students');

    const second = await fetchStudentsByClass('class-1');
    expect(fetchMock).toHaveBeenCalledTimes(1); // toujours 1 : servi depuis le cache
    expect(second).toEqual(first);
  });

  it('deux classes différentes ont des entrées de cache indépendantes', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(apiStudents(['a1'])))
      .mockResolvedValueOnce(jsonResponse(apiStudents(['b1', 'b2'])));
    vi.stubGlobal('fetch', fetchMock);

    const classA = await fetchStudentsByClass('class-a');
    const classB = await fetchStudentsByClass('class-b');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(classA).toHaveLength(1);
    expect(classB).toHaveLength(2);
  });

  it('invalidateClassRoster force un rechargement réseau au prochain appel', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(apiStudents(['s1'])))
      .mockResolvedValueOnce(jsonResponse(apiStudents(['s1', 's2'])));
    vi.stubGlobal('fetch', fetchMock);

    const before = await fetchStudentsByClass('class-2');
    expect(before).toHaveLength(1);

    invalidateClassRoster('class-2');

    const after = await fetchStudentsByClass('class-2');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(after).toHaveLength(2);
  });

  it('une entrée expirée (au-delà de la fenêtre de cache) redemande bien le réseau', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(apiStudents(['s1'])))
      .mockResolvedValueOnce(jsonResponse(apiStudents(['s1'])));
    vi.stubGlobal('fetch', fetchMock);

    await fetchStudentsByClass('class-3');
    vi.advanceTimersByTime(6 * 60 * 1000); // > 5 minutes de TTL
    await fetchStudentsByClass('class-3');

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("une erreur réseau renvoie une liste vide plutôt que de faire planter l'appel (dégradation déjà existante, non régressée)", async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    const result = await fetchStudentsByClass('class-4');
    expect(result).toEqual([]);
  });
});

describe('mapApiAttendance — nom élève', () => {
  it('expose student_name depuis l’enrichissement API', async () => {
    const { mapApiAttendance } = await import('./strkAttendanceService');
    const mapped = mapApiAttendance({
      id: 'a1',
      studentId: 's1',
      institutionId: 'i1',
      date: '2026-08-26',
      type: 'absence',
      duration: 60,
      student: { firstName: 'Esmone', lastName: 'Gnonzion' },
      courseName: 'Français',
      className: '5e A',
    });
    expect(mapped.student_name).toBe('Esmone Gnonzion');
    expect(mapped.course_name).toBe('Français');
    expect(mapped.class_name).toBe('5e A');
  });

  it('ne fabrique pas de libellé « Étudiant » si le profil est vide', async () => {
    const { mapApiAttendance } = await import('./strkAttendanceService');
    const mapped = mapApiAttendance({
      id: 'a2',
      studentId: 's2',
      institutionId: 'i1',
      date: '2026-08-26',
      type: 'lateness',
      duration: 15,
      student: null,
    });
    expect(mapped.student_name).toBeUndefined();
  });
});
