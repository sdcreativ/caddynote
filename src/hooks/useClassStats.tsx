import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/lib/apiClient';

export interface ClassStatItem {
  id: string;
  name: string;
  students: number;
  absences: number;
  attendanceRate: number | null;
  teacherName?: string;
  description?: string;
  institutionId?: string;
  teacherId?: string | null;
  maxStudents?: number | null;
  strk_institutions?: { name: string };
  strk_profiles?: { first_name: string; last_name: string };
  studentCount?: number;
  academic_year?: string;
  created_at?: string;
}

export interface ClassStats {
  classes: ClassStatItem[];
  totalStudents: number;
  averageAttendanceRate: number;
  classesWithDetails: ClassStatItem[];
  totalClasses: number;
  classesByInstitution: Record<string, number>;
  averageClassSize: number;
}

type ApiClass = {
  id: string;
  name: string;
  description?: string | null;
  academicYear?: string | null;
  createdAt?: string;
  institutionId?: string;
  teacherId?: string | null;
  maxStudents?: number | null;
  institution?: { id?: string; name: string } | null;
  teacher?: { id?: string; firstName: string | null; lastName: string | null } | null;
  _count?: { students?: number };
  absences30d?: number;
  attendanceRate?: number | null;
};

const emptyStats = (): ClassStats => ({
  classes: [],
  totalStudents: 0,
  averageAttendanceRate: 0,
  classesWithDetails: [],
  totalClasses: 0,
  classesByInstitution: {},
  averageClassSize: 0,
});

/**
 * Stats classes — avec `institutionId` (établissement) ou sans (vue globale admin).
 */
export const useClassStats = (institutionId?: string) => {
  const [stats, setStats] = useState<ClassStats>(emptyStats);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchClassStats = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const path = institutionId
        ? `/classes?institutionId=${encodeURIComponent(institutionId)}`
        : '/classes';

      const { classes: classesData } = await apiClient.get<{ classes: ApiClass[] }>(path);

      const classStats: ClassStatItem[] = (classesData || []).map((classItem) => {
        const studentCount = classItem._count?.students ?? 0;
        return {
          id: classItem.id,
          name: classItem.name,
          students: studentCount,
          absences: classItem.absences30d ?? 0,
          attendanceRate: classItem.attendanceRate ?? null,
          institutionId: classItem.institutionId || classItem.institution?.id,
          teacherId: classItem.teacherId ?? classItem.teacher?.id ?? null,
          maxStudents: classItem.maxStudents ?? null,
          teacherName: classItem.teacher
            ? [classItem.teacher.firstName, classItem.teacher.lastName].filter(Boolean).join(' ')
            : undefined,
          description: classItem.description ?? undefined,
          strk_institutions: classItem.institution?.name
            ? { name: classItem.institution.name }
            : undefined,
          strk_profiles: classItem.teacher
            ? {
                first_name: classItem.teacher.firstName || '',
                last_name: classItem.teacher.lastName || '',
              }
            : undefined,
          studentCount,
          academic_year: classItem.academicYear ?? undefined,
          created_at: classItem.createdAt,
        };
      });

      const totalStudents = classStats.reduce((sum, cls) => sum + cls.students, 0);
      const rates = classStats
        .map((c) => c.attendanceRate)
        .filter((r): r is number => typeof r === 'number');
      const averageAttendanceRate =
        rates.length > 0 ? Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 10) / 10 : 0;
      const classesByInstitution: Record<string, number> = {};
      for (const cls of classStats) {
        const key = cls.strk_institutions?.name || 'Sans établissement';
        classesByInstitution[key] = (classesByInstitution[key] || 0) + 1;
      }

      setStats({
        classes: classStats,
        totalStudents,
        averageAttendanceRate,
        classesWithDetails: classStats,
        totalClasses: classStats.length,
        classesByInstitution,
        averageClassSize: classStats.length > 0 ? Math.round(totalStudents / classStats.length) : 0,
      });
    } catch (err) {
      console.error('Error fetching class stats:', err);
      setError('Erreur lors du chargement des statistiques par classe');
      setStats(emptyStats());
    } finally {
      setLoading(false);
    }
  }, [institutionId]);

  useEffect(() => {
    void fetchClassStats();
  }, [fetchClassStats]);

  return { stats, loading, error, refetch: fetchClassStats };
};
