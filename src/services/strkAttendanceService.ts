import { apiClient } from "@/lib/apiClient";
import { CacheService } from "@/services/cacheService";
import { PerformanceService } from "@/services/performanceService";

export interface StrkAttendance {
  id: string;
  student_id: string;
  institution_id: string;
  course_id?: string;
  date: string;
  type: 'absence' | 'lateness';
  duration: number;
  justified?: boolean;
  reason?: string;
  justification?: string;
  justification_file?: string;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
  /** PRS-003 : identifiant généré côté client pour une synchronisation hors
   * ligne idempotente (voir `src/lib/offlineDb.ts`/`offlineSync.ts`). */
  client_id?: string;
  /** Nom affiché (API enrichie). */
  student_name?: string;
  course_name?: string;
  class_name?: string;
  /** Horaires du créneau (HH:MM) si connus. */
  start_time?: string;
  end_time?: string;
  /** Enseignant du cours / créneau. */
  teacher_name?: string;
  /** Qui a enregistré l’appel. */
  recorded_by_name?: string;
}

export interface ClassRosterStudent {
  id: string;
  name: string;
  studentNumber: string;
}

const ROSTER_CACHE_TTL = 5 * 60 * 1000; // 5 minutes — même défaut que CacheService

const rosterCacheKey = (classId: string) => CacheService.generateKey('roster', classId);

/** Liste réelle des élèves d'une classe (inscriptions canoniques).
 *
 * NFR-004 : cache 5 min via `CacheService` + mesure `PerformanceService`.
 * Source : `GET /classes/:id/students` (StrkClassStudent), avec repli
 * legacy `GET /subjects/student-classes/by-class/:id` (même contenu depuis §5.2).
 */
export const fetchStudentsByClass = async (classId: string): Promise<ClassRosterStudent[]> => {
  const cached = CacheService.get<ClassRosterStudent[]>(rosterCacheKey(classId));
  if (cached) return cached;

  try {
    return await PerformanceService.measureAsync(
      'attendance.fetchStudentsByClass',
      async () => {
        try {
          const { students } = await apiClient.get<{
            students: Array<{
              id: string;
              studentNumber?: string | null;
              profile?: { firstName: string | null; lastName: string | null } | null;
            }>;
          }>(`/classes/${encodeURIComponent(classId)}/students`);
          const roster = students.map((s) => ({
            id: s.id,
            name:
              [s.profile?.firstName, s.profile?.lastName].filter(Boolean).join(' ') || 'Élève',
            studentNumber: s.studentNumber ?? '',
          }));
          CacheService.set(rosterCacheKey(classId), roster, ROSTER_CACHE_TTL);
          return roster;
        } catch {
          const { students } = await apiClient.get<{
            students: {
              student: {
                id: string;
                firstName: string | null;
                lastName: string | null;
                studentNumber?: string | null;
              };
            }[];
          }>(`/subjects/student-classes/by-class/${encodeURIComponent(classId)}`);
          const roster = students.map((s) => ({
            id: s.student.id,
            name: [s.student.firstName, s.student.lastName].filter(Boolean).join(' ') || 'Élève',
            studentNumber: s.student.studentNumber ?? '',
          }));
          CacheService.set(rosterCacheKey(classId), roster, ROSTER_CACHE_TTL);
          return roster;
        }
      },
      { classId }
    );
  } catch (error) {
    console.error('Error in fetchStudentsByClass:', error);
    return [];
  }
};

/** À appeler après tout changement d'effectif d'une classe (élève
 * ajouté/retiré) — sans quoi la liste d'appel pourrait rester périmée
 * jusqu'à 5 minutes après un changement réel. */
export const invalidateClassRoster = (classId: string): void => {
  CacheService.delete(rosterCacheKey(classId));
};

export interface AttendanceStats {
  total_sessions: number;
  present_count: number;
  absent_count: number;
  late_count: number;
  excused_count: number;
  attendance_rate: number;
}

interface ApiAbsence {
  id: string;
  studentId: string;
  institutionId: string;
  courseId?: string | null;
  date: string;
  type: 'absence' | 'lateness';
  duration: number;
  justified?: boolean | null;
  reason?: string | null;
  justification?: string | null;
  justificationFile?: string | null;
  createdBy?: string | null;
  createdAt?: string;
  updatedAt?: string;
  clientId?: string | null;
  student?: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
  } | null;
  courseName?: string | null;
  className?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  teacherName?: string | null;
  recordedByName?: string | null;
}

/** Compose le nom élève depuis l’enrichissement API (jamais l’UUID). */
export const formatAttendanceStudentName = (
  student?: { firstName?: string | null; lastName?: string | null } | null
): string | undefined => {
  const name = [student?.firstName?.trim(), student?.lastName?.trim()].filter(Boolean).join(' ');
  return name || undefined;
};

export const mapApiAttendance = (a: ApiAbsence): StrkAttendance => ({
  id: a.id,
  student_id: a.studentId,
  institution_id: a.institutionId,
  course_id: a.courseId || undefined,
  date: a.date,
  type: a.type,
  duration: a.duration,
  justified: a.justified ?? undefined,
  reason: a.reason || undefined,
  justification: a.justification || undefined,
  justification_file: a.justificationFile || undefined,
  created_by: a.createdBy || undefined,
  created_at: a.createdAt,
  updated_at: a.updatedAt,
  client_id: a.clientId || undefined,
  student_name: formatAttendanceStudentName(a.student),
  course_name: a.courseName?.trim() || undefined,
  class_name: a.className?.trim() || undefined,
  start_time: a.startTime?.trim() || undefined,
  end_time: a.endTime?.trim() || undefined,
  teacher_name: a.teacherName?.trim() || undefined,
  recorded_by_name: a.recordedByName?.trim() || undefined,
});

/**
 * Complète les noms manquants à partir d’un roster classe (filet si l’API
 * n’a pas encore renvoyé `student` enrichi).
 */
export const attachAttendanceDisplayNames = (
  records: StrkAttendance[],
  opts?: {
    nameByStudentId?: Map<string, string>;
    courseNameById?: Map<string, string>;
  }
): StrkAttendance[] =>
  records.map((r) => ({
    ...r,
    student_name: r.student_name || opts?.nameByStudentId?.get(r.student_id) || undefined,
    course_name: r.course_name || (r.course_id ? opts?.courseNameById?.get(r.course_id) : undefined) || undefined,
  }));

/** Historique pour un ou plusieurs cours, avec noms élève/cours résolus. */
export const fetchAttendanceHistoryForCourses = async (
  courseIds: string[],
  opts?: {
    classIds?: string[];
    courseNameById?: Map<string, string>;
  }
): Promise<StrkAttendance[]> => {
  if (courseIds.length === 0) return [];

  const nested = await Promise.all(courseIds.map((id) => fetchAttendanceByClass(id)));
  const byId = new Map<string, StrkAttendance>();
  for (const row of nested.flat()) byId.set(row.id, row);
  let records = [...byId.values()];

  const nameByStudentId = new Map<string, string>();
  const classIds = [...new Set((opts?.classIds ?? []).filter(Boolean))];
  if (classIds.length > 0) {
    const rosters = await Promise.all(classIds.map((id) => fetchStudentsByClass(id)));
    for (const roster of rosters) {
      for (const student of roster) {
        if (student.name && student.name !== 'Élève') nameByStudentId.set(student.id, student.name);
      }
    }
  }

  records = attachAttendanceDisplayNames(records, {
    nameByStudentId,
    courseNameById: opts?.courseNameById,
  });

  return records.sort((a, b) => {
    const byDate = new Date(b.date).getTime() - new Date(a.date).getTime();
    if (byDate !== 0) return byDate;
    return (a.student_name || a.student_id).localeCompare(b.student_name || b.student_id, 'fr');
  });
};

export const fetchAttendanceByClass = async (classId: string, date?: string): Promise<StrkAttendance[]> => {
  try {
    const params = new URLSearchParams({ courseId: classId });
    if (date) params.set('date', date);
    const { absences } = await apiClient.get<{ absences: ApiAbsence[] }>(`/absences?${params.toString()}`);
    return absences.map(mapApiAttendance);
  } catch (error) {
    console.error("Error in fetchAttendanceByClass:", error);
    return [];
  }
};

/** Historique d’absences/retards pour l’effectif d’une classe (hub Présences). */
export const fetchAttendanceHistoryByClass = async (
  classId: string,
  opts?: { startDate?: string; endDate?: string }
): Promise<StrkAttendance[]> => {
  try {
    const params = new URLSearchParams({ classId });
    if (opts?.startDate) params.set('startDate', opts.startDate);
    if (opts?.endDate) params.set('endDate', opts.endDate);
    const { absences } = await apiClient.get<{ absences: ApiAbsence[] }>(`/absences?${params.toString()}`);
    return absences.map(mapApiAttendance);
  } catch (error) {
    console.error('Error in fetchAttendanceHistoryByClass:', error);
    return [];
  }
};

export const fetchAttendanceByStudent = async (studentId: string, startDate?: string, endDate?: string): Promise<StrkAttendance[]> => {
  try {
    const params = new URLSearchParams({ studentId });
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    const { absences } = await apiClient.get<{ absences: ApiAbsence[] }>(`/absences?${params.toString()}`);
    return absences.map(mapApiAttendance);
  } catch (error) {
    console.error("Error in fetchAttendanceByStudent:", error);
    return [];
  }
};

export const markAttendance = async (attendance: Omit<StrkAttendance, "id" | "created_at" | "updated_at">): Promise<StrkAttendance | null> => {
  try {
    const { absence } = await apiClient.post<{ absence: ApiAbsence }>('/absences', {
      studentId: attendance.student_id,
      institutionId: attendance.institution_id,
      courseId: attendance.course_id,
      type: attendance.type,
      date: attendance.date,
      duration: attendance.duration,
      clientId: attendance.client_id,
    });
    return mapApiAttendance(absence);
  } catch (error) {
    console.error("Error in markAttendance:", error);
    return null;
  }
};

export const updateAttendance = async (id: string, updates: Partial<StrkAttendance>): Promise<StrkAttendance | null> => {
  try {
    const { absence } = await apiClient.patch<{ absence: ApiAbsence }>(`/absences/${id}/review`, {
      justified: updates.justified,
    });
    return mapApiAttendance(absence);
  } catch (error) {
    console.error("Error in updateAttendance:", error);
    return null;
  }
};

export const bulkMarkAttendance = async (attendanceList: Omit<StrkAttendance, "id" | "created_at" | "updated_at">[]): Promise<StrkAttendance[]> => {
  const { absences } = await apiClient.post<{ absences: ApiAbsence[] }>(
    '/absences/bulk',
    attendanceList.map((a) => ({
      studentId: a.student_id,
      institutionId: a.institution_id,
      courseId: a.course_id,
      type: a.type,
      date: a.date,
      duration: a.duration,
      clientId: a.client_id,
    }))
  );
  return absences.map(mapApiAttendance);
};

export const getAttendanceStats = async (studentId: string, startDate: string, endDate: string): Promise<AttendanceStats> => {
  try {
    const { stats } = await apiClient.get<{ stats: AttendanceStats }>(
      `/absences/stats?studentId=${encodeURIComponent(studentId)}&startDate=${startDate}&endDate=${endDate}`
    );
    return stats;
  } catch (error) {
    console.error("Error in getAttendanceStats:", error);
    return {
      total_sessions: 0,
      present_count: 0,
      absent_count: 0,
      late_count: 0,
      excused_count: 0,
      attendance_rate: 0
    };
  }
};

export type UpcomingAttendanceCall = {
  courseId: string;
  classId: string | null;
  courseName: string;
  className: string | null;
  startTime: string;
  scheduleId: string | null;
  minutesUntilStart: number;
};

/** Créneaux de l’enseignant démarrant dans N minutes (rappel d’appel dashboard). */
export const fetchUpcomingAttendanceCalls = async (
  withinMinutes = 10
): Promise<UpcomingAttendanceCall[]> => {
  try {
    const { calls } = await apiClient.get<{ calls: UpcomingAttendanceCall[] }>(
      `/absences/upcoming-calls?withinMinutes=${encodeURIComponent(String(withinMinutes))}`
    );
    return calls ?? [];
  } catch (error) {
    console.error('Error in fetchUpcomingAttendanceCalls:', error);
    return [];
  }
};
