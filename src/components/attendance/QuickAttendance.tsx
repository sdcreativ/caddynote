import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Users, CheckCircle, XCircle, Clock, Search } from 'lucide-react';
import { bulkMarkAttendance, StrkAttendance } from '@/services/strkAttendanceService';
import { useToast } from '@/hooks/use-toast';
import { cacheRoster, getCachedRoster, queueAttendance } from '@/lib/offlineDb';
import { flushPendingAttendance } from '@/lib/offlineSync';
import { OfflineStatusBadge } from './OfflineStatusBadge';
import { newClientId } from '@/lib/clientId';
import { ApiError } from '@/lib/apiClient';

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

export const QuickAttendance = ({ classId, institutionId, students, courseId, onAttendanceSubmitted }: QuickAttendanceProps) => {
  const { t } = useTranslation('attendance');
  const { t: tc } = useTranslation('common');
  const [attendanceData, setAttendanceData] = useState<Record<string, 'present' | 'absent' | 'late'>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  // PRS-003 : dès qu'une vraie liste d'élèves est disponible (réseau
  // présent), on la met en cache pour pouvoir faire l'appel même hors ligne
  // juste après (ex. professeur qui entre dans une salle sans réseau).
  useEffect(() => {
    if (classId && students.length > 0) {
      void cacheRoster(classId, students);
    }
  }, [classId, students]);

  const filteredStudents = students.filter(student =>
    student.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    student.studentNumber.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const markAll = (status: 'present' | 'absent' | 'late') => {
    const newData: Record<string, 'present' | 'absent' | 'late'> = {};
    students.forEach(student => {
      newData[student.id] = status;
    });
    setAttendanceData(newData);
  };

  const markStudent = (studentId: string, status: 'present' | 'absent' | 'late') => {
    setAttendanceData(prev => ({
      ...prev,
      [studentId]: status
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
      const date = new Date().toISOString().split('T')[0];
      const entries = Object.entries(attendanceData).filter(([, status]) => status !== 'present');

      if (entries.length === 0) {
        toast({ title: t('quick.savedTitle'), description: t('quick.allPresentBody') });
        setAttendanceData({});
        return;
      }

      // PRS-003 : chaque saisie porte un identifiant généré une seule fois
      // ici (`clientId`), envoyé tel quel que la synchronisation ait lieu
      // immédiatement ou après une période hors ligne — c'est ce qui rend la
      // resynchronisation sans doublon, côté serveur (POST /absences/bulk).
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
        // Profite de la connexion présente pour vider une éventuelle file
        // laissée par une session précédente hors ligne.
        void flushPendingAttendance();
      }

      setAttendanceData({});
    } catch (error) {
      console.error('Error submitting attendance:', error);
      toast({
        title: tc('status.error'),
        description: error instanceof ApiError && error.message ? error.message : t('quick.saveError'),
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusCounts = () => {
    const counts = { present: 0, absent: 0, late: 0, unmarked: 0 };
    students.forEach(student => {
      const status = attendanceData[student.id];
      if (status) {
        counts[status]++;
      } else {
        counts.unmarked++;
      }
    });
    return counts;
  };

  const statusCounts = getStatusCounts();

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
        <CardDescription>
          {t('quick.description')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Statistiques */}
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

        {/* Actions rapides */}
        <div className="flex gap-2">
          <Button onClick={() => markAll('present')} variant="outline" size="sm" className="flex-1">
            <CheckCircle className="h-4 w-4 mr-1" />
            {t('quick.allPresent')}
          </Button>
          <Button onClick={() => markAll('absent')} variant="outline" size="sm" className="flex-1">
            <XCircle className="h-4 w-4 mr-1" />
            {t('quick.allAbsent')}
          </Button>
          <Button onClick={() => setAttendanceData({})} variant="outline" size="sm" className="flex-1">
            {tc('actions.reset')}
          </Button>
        </div>

        {/* Recherche */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('quick.searchPlaceholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Liste des étudiants */}
        <div className="max-h-96 overflow-y-auto space-y-2">
          {filteredStudents.map(student => (
            <div key={student.id} className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex-1">
                <div className="font-medium">{student.name}</div>
                <div className="text-sm text-muted-foreground">{student.studentNumber}</div>
              </div>
              <div className="flex gap-1">
                <Button
                  onClick={() => markStudent(student.id, 'present')}
                  variant={attendanceData[student.id] === 'present' ? 'default' : 'outline'}
                  size="sm"
                >
                  <CheckCircle className="h-4 w-4" />
                </Button>
                <Button
                  onClick={() => markStudent(student.id, 'late')}
                  variant={attendanceData[student.id] === 'late' ? 'default' : 'outline'}
                  size="sm"
                >
                  <Clock className="h-4 w-4" />
                </Button>
                <Button
                  onClick={() => markStudent(student.id, 'absent')}
                  variant={attendanceData[student.id] === 'absent' ? 'default' : 'outline'}
                  size="sm"
                >
                  <XCircle className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        {/* Soumission */}
        <Button 
          onClick={submitAttendance} 
          className="w-full" 
          disabled={isSubmitting || Object.keys(attendanceData).length === 0}
        >
          {isSubmitting ? t('quick.submitting') : t('quick.submit')}
        </Button>
      </CardContent>
    </Card>
  );
};
