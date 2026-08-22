import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/apiClient';

export interface SchoolStats {
  totalStudents: number;
  totalTeachers: number;
  totalClasses: number;
  attendanceRate: number;
  todayAttendances: number;
  todayAbsences: number;
  weeklyAbsences: any[];
  recentEvents: any[];
}

export const useSchoolStats = (institutionId?: string) => {
  const [stats, setStats] = useState<SchoolStats>({
    totalStudents: 0,
    totalTeachers: 0,
    totalClasses: 0,
    attendanceRate: 0,
    todayAttendances: 0,
    todayAbsences: 0,
    weeklyAbsences: [],
    recentEvents: []
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    if (!institutionId) return;

    try {
      setLoading(true);
      setError(null);

      const today = new Date().toISOString().split('T')[0];

      const [usersRes, classesRes, absencesRes] = await Promise.all([
        apiClient.get<{ users: any[] }>(`/users?institutionId=${encodeURIComponent(institutionId)}`),
        apiClient.get<{ classes: any[] }>(`/classes?institutionId=${encodeURIComponent(institutionId)}`),
        apiClient.get<{ absences: any[] }>(`/absences?institutionId=${encodeURIComponent(institutionId)}`),
      ]);

      const totalStudents = usersRes.users.filter((u) => u.role === 'student').length;
      const totalTeachers = usersRes.users.filter((u) => u.role === 'teacher').length;
      const totalClasses = classesRes.classes.length;

      const todayAbsences = absencesRes.absences.filter((a) => a.date?.startsWith(today)).length;
      // strk_attendances n'est alimentée nulle part dans l'application (table
      // toujours vide côté Supabase d'origine) — conservé à 0 fidèlement.
      const todayAttendances = 0;

      const totalSessions = todayAttendances + todayAbsences;
      const attendanceRate = totalSessions > 0 ? (todayAttendances / totalSessions) * 100 : 0;

      const recentEvents = absencesRes.absences
        .slice()
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 10)
        .map((absence, index) => ({
          id: absence.id,
          type: 'absence',
          student: `Étudiant ${index + 1}`,
          class: 'Classe non définie',
          date: new Date(absence.createdAt).toLocaleDateString('fr-FR'),
          status: absence.justified ? 'justifiée' : 'non-justifiée',
          reason: absence.reason || 'Non spécifiée'
        }));

      const weeklyAbsences = getWeeklyAbsenceStats(absencesRes.absences);

      setStats({
        totalStudents,
        totalTeachers,
        totalClasses,
        attendanceRate: Math.round(attendanceRate * 10) / 10,
        todayAttendances,
        todayAbsences,
        weeklyAbsences,
        recentEvents
      });

    } catch (err) {
      console.error('Error fetching school stats:', err);
      setError('Erreur lors du chargement des statistiques');
    } finally {
      setLoading(false);
    }
  };

  const getWeeklyAbsenceStats = (absences: any[]) => {
    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - ((startOfWeek.getDay() + 6) % 7)); // Lundi
    startOfWeek.setHours(0, 0, 0, 0);
    const endOfWeek = new Date();

    const inRange = absences.filter((a) => {
      const created = new Date(a.createdAt);
      return created >= startOfWeek && created <= endOfWeek;
    });

    const days = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven'];
    return days.map((day, index) => {
      const dayDate = new Date(startOfWeek);
      dayDate.setDate(dayDate.getDate() + index);
      const dayStr = dayDate.toISOString().split('T')[0];

      const dayAbsences = inRange.filter((a) => String(a.createdAt).startsWith(dayStr)).length;

      return {
        name: day,
        absences: dayAbsences,
        retards: Math.floor(dayAbsences * 0.3),
        signatures: Math.floor(dayAbsences * 3)
      };
    });
  };

  useEffect(() => {
    if (institutionId) {
      fetchStats();
    }
  }, [institutionId]);

  return { stats, loading, error, refetch: fetchStats };
};
