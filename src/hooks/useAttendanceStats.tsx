import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/apiClient';

export interface AttendanceStats {
  presentToday: number;
  absentToday: number;
  lateToday: number;
  attendanceRate: number;
  weeklyTrend: any[];
  topAbsentClasses: any[];
}

export const useAttendanceStats = (institutionId?: string) => {
  const [stats, setStats] = useState<AttendanceStats>({
    presentToday: 0,
    absentToday: 0,
    lateToday: 0,
    attendanceRate: 0,
    weeklyTrend: [],
    topAbsentClasses: []
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAttendanceStats = async () => {
    if (!institutionId) return;

    try {
      setLoading(true);
      setError(null);

      const today = new Date().toISOString().split('T')[0];
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const { absences } = await apiClient.get<{ absences: any[] }>(
        `/absences?institutionId=${encodeURIComponent(institutionId)}`
      );

      // strk_attendances n'est alimentée nulle part dans l'application
      // (table toujours vide côté Supabase d'origine) — conservé à 0.
      const presentToday = 0;
      const absentToday = absences.filter((a) => String(a.createdAt).startsWith(today)).length;

      const lateToday = Math.floor(absentToday * 0.3);
      const actualAbsences = absentToday - lateToday;

      const totalExpected = presentToday + actualAbsences;
      const attendanceRate = totalExpected > 0 ? (presentToday / totalExpected) * 100 : 100;

      const totalAbsencesThisWeek = absences.filter((a) => new Date(a.createdAt) >= weekAgo).length;
      const topAbsentClasses = [
        { name: 'Classe A', absences: Math.floor(totalAbsencesThisWeek * 0.3), students: 30, attendanceRate: 85 },
        { name: 'Classe B', absences: Math.floor(totalAbsencesThisWeek * 0.25), students: 28, attendanceRate: 90 },
        { name: 'Classe C', absences: Math.floor(totalAbsencesThisWeek * 0.2), students: 32, attendanceRate: 92 }
      ].filter((cls) => cls.absences > 0);

      const weeklyTrend = getWeeklyAttendanceTrend(absences);

      setStats({
        presentToday,
        absentToday: actualAbsences,
        lateToday,
        attendanceRate: Math.round(attendanceRate * 10) / 10,
        weeklyTrend,
        topAbsentClasses
      });

    } catch (err) {
      console.error('Error fetching attendance stats:', err);
      setError('Erreur lors du chargement des statistiques de présence');
    } finally {
      setLoading(false);
    }
  };

  const getWeeklyAttendanceTrend = (absences: any[]) => {
    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - ((startOfWeek.getDay() + 6) % 7));
    startOfWeek.setHours(0, 0, 0, 0);

    const days = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'];
    return days.map((day, index) => {
      const dayDate = new Date(startOfWeek);
      dayDate.setDate(dayDate.getDate() + index);
      const dayStr = dayDate.toISOString().split('T')[0];

      const dayAttendances = 0; // cf. note strk_attendances ci-dessus
      const dayAbsences = absences.filter((a) => String(a.createdAt).startsWith(dayStr)).length;

      return {
        name: day,
        presents: dayAttendances,
        absents: dayAbsences,
        rate: dayAttendances + dayAbsences > 0 ? Math.round((dayAttendances / (dayAttendances + dayAbsences)) * 100) : 100
      };
    });
  };

  useEffect(() => {
    if (institutionId) {
      fetchAttendanceStats();
    }
  }, [institutionId]);

  return { stats, loading, error, refetch: fetchAttendanceStats };
};
