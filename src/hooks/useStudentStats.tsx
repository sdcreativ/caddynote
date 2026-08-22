import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/lib/apiClient';

export type StudentRow = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phoneNumber?: string | null;
  institutionId?: string | null;
  institutionName?: string;
  createdAt?: string;
  className?: string | null;
  attendanceRate: number | null;
  isActive: boolean;
};

export interface StudentStats {
  totalStudents: number;
  studentsByInstitution: Record<string, number>;
  recentStudents: StudentRow[];
  studentsWithClasses: StudentRow[];
  averageAttendanceRate: number | null;
}

export const useStudentStats = () => {
  const [stats, setStats] = useState<StudentStats>({
    totalStudents: 0,
    studentsByInstitution: {},
    recentStudents: [],
    studentsWithClasses: [],
    averageAttendanceRate: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { students } = await apiClient.get<{ students: any[] }>('/students');

      const rows: StudentRow[] = (students || []).map((s) => {
        const rate =
          s.attendanceRate != null && s.attendanceRate !== ''
            ? Number(s.attendanceRate)
            : null;
        return {
          id: s.id,
          email: s.profile?.email || '',
          firstName: s.profile?.firstName || '',
          lastName: s.profile?.lastName || '',
          phoneNumber: s.profile?.phoneNumber,
          institutionId: s.institutionId,
          institutionName: s.institution?.name,
          createdAt: s.profile?.createdAt || s.createdAt,
          className: s.class?.name ?? null,
          attendanceRate: Number.isFinite(rate as number) ? (rate as number) : null,
          isActive: s.profile?.isActive !== false,
        };
      });

      const studentsByInstitution = rows.reduce((acc, student) => {
        const key = student.institutionName || student.institutionId || 'Sans institution';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const withRate = rows.filter((r) => r.attendanceRate != null);
      const averageAttendanceRate =
        withRate.length > 0
          ? Math.round(
              withRate.reduce((sum, r) => sum + (r.attendanceRate as number), 0) / withRate.length
            )
          : null;

      setStats({
        totalStudents: rows.length,
        studentsByInstitution,
        recentStudents: rows.slice(0, 5),
        studentsWithClasses: rows,
        averageAttendanceRate,
      });
    } catch (err) {
      console.error('Error fetching student stats:', err);
      setError('Impossible de charger les élèves');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  return { stats, loading, error, refetch: fetchStats };
};
