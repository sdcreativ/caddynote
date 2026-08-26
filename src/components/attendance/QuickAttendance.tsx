import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Users, CheckCircle, XCircle, Clock, Search } from 'lucide-react';
import {
  bulkMarkAttendance,
  fetchAttendanceHistoryByClass,
  StrkAttendance,
} from '@/services/strkAttendanceService';
import { useToast } from '@/hooks/use-toast';
import { cacheRoster, queueAttendance } from '@/lib/offlineDb';
import { flushPendingAttendance } from '@/lib/offlineSync';
import { OfflineStatusBadge } from './OfflineStatusBadge';
import { newClientId } from '@/lib/clientId';
import { ApiError } from '@/lib/apiClient';

type AttendanceStatus = 'present' | 'absent' | 'late';

interface Student {
  id: string;
  name: string;
  studentNumber: string;
}

interface QuickAttendanceProps {
  classId: string;
  institutionId: string;
  students: Student[];
  courseId?: string;
  onAttendanceSubmitted?: (attendanceList: StrkAttendance[]) => void;
}

const todayIso = () => new Date().toISOString().split('T')[0];

/** Construit l’état d’appel à partir des absences/retards du jour.
 * Si au moins une saisie existe pour la classe aujourd’hui, les élèves
 * sans enregistrement sont considérés présents (l’appel a déjà eu lieu). */
const buildStatusMap = (
  students: Student[],
  records: StrkAttendance[]
): Record<string, AttendanceStatus> => {
  const byStudent = new Map<string, AttendanceStatus>();
  for (const r of records) {
    byStudent.set(r.student_id, r.type === 'lateness' ? 'late' : 'absent');
  }
  const next: Record<string, AttendanceStatus> = {};
  const sessionStarted = byStudent.size > 0;
  for (const student of students) {
    const marked = byStudent.get(student.id);
    if (marked) {
      next[student.id] = marked;
    } else if (sessionStarted) {
      next[student.id] = 'present';
    }
  }
  return next;
};

export const QuickAttendance = ({
  classId,
  institutionId,
  students,
  courseId,
  onAttendanceSubmitted,
}: QuickAttendanceProps) => {
  const { t } = useTranslation('attendance');
  const { t: tc } = useTranslation('common');
  const [attendanceData, setAttendanceData] = useState<Record<string, AttendanceStatus>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isHydrating, setIsHydrating] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (classId && students.length > 0) {
      void cacheRoster(classId, students);
    }
  }, [classId, students]);

  // Recharge l’appel du jour pour que les totaux reflètent l’existant.
  const studentIdsKey = students.map((s) => s.id).join(',');
  useEffect(() => {
    if (!classId || students.length === 0) {
      setAttendanceData({});
      return;
    }
    let cancelled = false;
    setIsHydrating(true);
    const date = todayIso();
    const roster = students;
    (async () => {
      const records = await fetchAttendanceHistoryByClass(classId, {
        startDate: date,
        endDate: date,
      });
      if (!cancelled) {
        setAttendanceData(buildStatusMap(roster, records));
        setIsHydrating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // studentIdsKey évite de recharger à chaque nouveau tableau `students` identique.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- volontaire
  }, [classId, studentIdsKey]);

  const filteredStudents = students.filter(
    (student) =>
      student.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      student.studentNumber.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const markAll = (status: AttendanceStatus) => {
    const newData: Record<string, AttendanceStatus> = {};
    students.forEach((student) => {
      newData[student.id] = status;
    });
    setAttendanceData(newData);
  };

  const markStudent = (studentId: string, status: AttendanceStatus) => {
    setAttendanceData((prev) => ({
      ...prev,
      [studentId]: status,
    }));
  };

  const submitAttendance = async () => {
    try {
      setIsSubmitting(true);
      if (!institutionId) {
        toast({
          title: tc('status.error'),
          description: t('quick.saveError'),
          variant: 'destructive',
        });
        return;
      }
      const date = todayIso();
      const entries = Object.entries(attendanceData).filter(([, status]) => status !== 'present');

      if (entries.length === 0) {
        // Tous présents : rien à persister, on conserve l’affichage des totaux.
        const allPresent: Record<string, AttendanceStatus> = {};
        students.forEach((s) => {
          allPresent[s.id] = 'present';
        });
        setAttendanceData(allPresent);
        toast({ title: t('quick.savedTitle'), description: t('quick.allPresentBody') });
        return;
      }

      const attendanceList: Omit<StrkAttendance, 'id' | 'created_at' | 'updated_at'>[] = entries.map(
        ([studentId, status]) => ({
          student_id: studentId,
          institution_id: institutionId,
          course_id: courseId,
          date,
          type: status === 'late' ? 'lateness' : 'absence',
          duration: status === 'late' ? 15 : 60,
          justified: false,
          client_id: newClientId(),
        })
      );

      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        await queueAttendance(
          attendanceList.map((a) => ({
            clientId: a.client_id!,
            studentId: a.student_id,
            institutionId: a.institution_id,
            courseId: a.course_id,
            type: a.type,
            date: a.date,
            duration: a.duration,
            queuedAt: new Date().toISOString(),
          }))
        );
        toast({
          title: t('quick.offlineTitle'),
          description: t('quick.offlineBody', { count: attendanceList.length }),
        });
      } else {
        const results = await bulkMarkAttendance(attendanceList);
        if (results.length === 0) {
          throw new Error(t('quick.saveError'));
        }
        onAttendanceSubmitted?.(results);
        toast({
          title: t('quick.savedTitle'),
          description: t('quick.savedBody', { count: results.length }),
        });
        void flushPendingAttendance();
      }

      // Après enregistrement : absents/retards saisis + le reste présents.
      const next: Record<string, AttendanceStatus> = {};
      students.forEach((s) => {
        const status = attendanceData[s.id];
        next[s.id] = status === 'absent' || status === 'late' ? status : 'present';
      });
      setAttendanceData(next);
    } catch (error) {
      console.error('Error submitting attendance:', error);
      toast({
        title: tc('status.error'),
        description: error instanceof ApiError && error.message ? error.message : t('quick.saveError'),
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const statusCounts = useMemo(() => {
    const counts = { present: 0, absent: 0, late: 0, unmarked: 0 };
    students.forEach((student) => {
      const status = attendanceData[student.id];
      if (status) {
        counts[status]++;
      } else {
        counts.unmarked++;
      }
    });
    return counts;
  }, [students, attendanceData]);

  const markedCount = Object.keys(attendanceData).length;

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {t('quick.title')}
          </span>
          <OfflineStatusBadge />
        </CardTitle>
        <CardDescription>{t('quick.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-4 gap-2">
          <div className="text-center">
            <div className="text-lg font-bold text-green-600">{statusCounts.present}</div>
            <div className="text-xs text-muted-foreground">{t('quick.present')}</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-red-600">{statusCounts.absent}</div>
            <div className="text-xs text-muted-foreground">{t('quick.absent')}</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-orange-600">{statusCounts.late}</div>
            <div className="text-xs text-muted-foreground">{t('quick.late')}</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-gray-600">{statusCounts.unmarked}</div>
            <div className="text-xs text-muted-foreground">{t('quick.unmarked')}</div>
          </div>
        </div>

        <div className="flex gap-2">
          <Button type="button" onClick={() => markAll('present')} variant="outline" size="sm" className="flex-1">
            <CheckCircle className="h-4 w-4 mr-1" />
            {t('quick.allPresent')}
          </Button>
          <Button type="button" onClick={() => markAll('absent')} variant="outline" size="sm" className="flex-1">
            <XCircle className="h-4 w-4 mr-1" />
            {t('quick.allAbsent')}
          </Button>
          <Button type="button" onClick={() => setAttendanceData({})} variant="outline" size="sm" className="flex-1">
            {tc('actions.reset')}
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('quick.searchPlaceholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="max-h-96 overflow-y-auto space-y-2">
          {isHydrating ? (
            <p className="text-sm text-muted-foreground py-4 text-center">{tc('actions.loading')}</p>
          ) : (
            filteredStudents.map((student) => (
              <div key={student.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex-1">
                  <div className="font-medium">{student.name}</div>
                  <div className="text-sm text-muted-foreground">{student.studentNumber}</div>
                </div>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    onClick={() => markStudent(student.id, 'present')}
                    variant={attendanceData[student.id] === 'present' ? 'default' : 'outline'}
                    size="sm"
                    aria-label={t('quick.present')}
                  >
                    <CheckCircle className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    onClick={() => markStudent(student.id, 'late')}
                    variant={attendanceData[student.id] === 'late' ? 'default' : 'outline'}
                    size="sm"
                    aria-label={t('quick.late')}
                  >
                    <Clock className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    onClick={() => markStudent(student.id, 'absent')}
                    variant={attendanceData[student.id] === 'absent' ? 'default' : 'outline'}
                    size="sm"
                    aria-label={t('quick.absent')}
                  >
                    <XCircle className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        <Button
          type="button"
          onClick={submitAttendance}
          className="w-full"
          disabled={isSubmitting || isHydrating || markedCount === 0}
        >
          {isSubmitting ? t('quick.submitting') : t('quick.submit')}
        </Button>
      </CardContent>
    </Card>
  );
};
