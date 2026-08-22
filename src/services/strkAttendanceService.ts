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
}

const mapApiAttendance = (a: ApiAbsence): StrkAttendance => ({
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
});

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
  try {
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
  } catch (error) {
    console.error("Error in bulkMarkAttendance:", error);
    return [];
  }
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
