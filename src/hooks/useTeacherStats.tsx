import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/lib/apiClient';

export type TeacherRow = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phoneNumber?: string | null;
  institutionId?: string | null;
  institutionName?: string;
  createdAt?: string;
  classCount: number;
  isActive: boolean;
};

export interface TeacherStats {
  totalTeachers: number;
  teachersByInstitution: Record<string, number>;
  recentTeachers: TeacherRow[];
  teachersWithClasses: TeacherRow[];
}

export const useTeacherStats = () => {
  const [stats, setStats] = useState<TeacherStats>({
    totalTeachers: 0,
    teachersByInstitution: {},
    recentTeachers: [],
    teachersWithClasses: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Une seule passe classes (évite N+1 `/classes?teacherId=`).
      const [{ users }, { institutions }, classesRes] = await Promise.all([
        apiClient.get<{ users: any[] }>('/users'),
        apiClient.get<{ institutions: any[] }>('/institutions'),
        apiClient.get<{ classes: Array<{ teacherId?: string | null }> }>('/classes').catch(() => ({
          classes: [] as Array<{ teacherId?: string | null }>,
        })),
      ]);
      const institutionById = new Map((institutions || []).map((i) => [i.id, i.name as string]));

      const classCountByTeacher = new Map<string, number>();
      for (const c of classesRes.classes || []) {
        if (!c.teacherId) continue;
        classCountByTeacher.set(c.teacherId, (classCountByTeacher.get(c.teacherId) || 0) + 1);
      }

      const teachers = users
        .filter((u) => u.role === 'teacher')
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      const teachersByInstitution = teachers.reduce((acc, teacher) => {
        const key = teacher.institutionId
          ? institutionById.get(teacher.institutionId) || teacher.institutionId
          : 'Sans institution';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const teachersWithClasses: TeacherRow[] = teachers.map((teacher) => ({
        id: teacher.id,
        email: teacher.email || '',
        firstName: teacher.firstName || '',
        lastName: teacher.lastName || '',
        phoneNumber: teacher.phoneNumber,
        institutionId: teacher.institutionId,
        institutionName: teacher.institutionId
          ? institutionById.get(teacher.institutionId)
          : undefined,
        createdAt: teacher.createdAt,
        classCount: classCountByTeacher.get(teacher.id) || 0,
        isActive: teacher.isActive !== false,
      }));

      setStats({
        totalTeachers: teachers.length,
        teachersByInstitution,
        recentTeachers: teachersWithClasses.slice(0, 5),
        teachersWithClasses,
      });
    } catch (err) {
      console.error('Error fetching teacher stats:', err);
      setError('Impossible de charger les enseignants');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  return { stats, loading, error, refetch: fetchStats };
};
