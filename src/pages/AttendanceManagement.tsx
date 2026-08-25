import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar, Users, Scan, BarChart3, Download } from 'lucide-react';
import { AttendanceScanner } from '@/components/attendance/AttendanceScanner';
import { QuickAttendance } from '@/components/attendance/QuickAttendance';
import { AttendanceHistory } from '@/components/attendance/AttendanceHistory';
import { useToast } from '@/hooks/use-toast';
import { useStrkClasses } from '@/hooks/useStrkClasses';
import { useStrkAuth } from '@/hooks/useStrkAuth';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import { fetchStudentsByClass, type ClassRosterStudent } from '@/services/strkAttendanceService';
import { getCachedRoster } from '@/lib/offlineDb';
import { downloadReportExport } from '@/services/strkReportService';
import { PresenceHubTabs } from '@/components/attendance/PresenceHubTabs';

const AttendanceManagement = () => {
  const { t } = useTranslation('attendance');
  const { t: tc } = useTranslation('common');
  const { user } = useStrkAuth();
  const { classes, isLoading, loadClassesByInstitution } = useStrkClasses();
  const [selectedClass, setSelectedClass] = useState<any>(null);
  const [attendanceData, setAttendanceData] = useState<any[]>([]);
  const [rosterStudents, setRosterStudents] = useState<ClassRosterStudent[]>([]);
  const [isRosterLoading, setIsRosterLoading] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const { toast } = useToast();

  const isTeacherHub =
    user?.role === 'teacher' || user?.role === 'head_teacher';

  useEffect(() => {
    if (isTeacherHub) return;
    if (user?.institutionId) {
      loadClassesByInstitution(user.institutionId);
    }
  }, [user?.institutionId, loadClassesByInstitution, isTeacherHub]);

  useEffect(() => {
    if (isTeacherHub) return;
    if (classes.length > 0 && !selectedClass) {
      setSelectedClass(classes[0]);
    }
  }, [classes, selectedClass, isTeacherHub]);

  // PRS-003 : essaie le réseau d'abord ; si indisponible (hors ligne ou
  // requête en échec), retombe sur la dernière liste mise en cache pour
  // cette classe (téléchargée lors d'un précédent appel en ligne).
  useEffect(() => {
    if (isTeacherHub) return;
    if (!selectedClass?.id) {
      setRosterStudents([]);
      return;
    }
    let cancelled = false;
    setIsRosterLoading(true);
    (async () => {
      let list: ClassRosterStudent[] = [];
      if (typeof navigator === 'undefined' || navigator.onLine !== false) {
        list = await fetchStudentsByClass(selectedClass.id);
      }
      if (list.length === 0) {
        const cached = await getCachedRoster(selectedClass.id);
        list = cached?.students ?? [];
      }
      if (!cancelled) {
        setRosterStudents(list);
        setIsRosterLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedClass?.id, isTeacherHub]);

  // Enseignants : surface dédiée (`/teacher-attendance`), pas le hub établissement.
  if (isTeacherHub) {
    return <Navigate to="/teacher-attendance" replace />;
  }

  const handleAttendanceMarked = (attendance: any) => {
    setAttendanceData((prev) => [...prev, attendance]);
    setHistoryRefreshKey((k) => k + 1);
  };

  // Bug réel corrigé au passage (découvert en travaillant NFR-004, même
  // écran) : ce bouton se contentait d'un toast « Export en cours » sans
  // jamais rien produire — même malfaçon que celle corrigée pour RPT-002.
  // `GET /reports/export?type=attendance` existe déjà et est testé ; il
  // suffisait de l'appeler.
  const exportAttendance = async () => {
    if (!user?.institutionId) return;
    try {
      await downloadReportExport('attendance', user.institutionId);
    } catch (error) {
      toast({
        title: t('page.exportErrorTitle'),
        description: error instanceof Error ? error.message : t('page.exportErrorBody'),
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6 py-6">
      <PresenceHubTabs />
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0">
        <div>
          <h1 className="text-3xl font-bold">{t('page.title')}</h1>
          <p className="text-muted-foreground mt-1">
            {t('page.subtitle')}
          </p>
        </div>
        
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportAttendance}>
            <Download className="h-4 w-4 mr-2" />
            {tc('actions.export')}
          </Button>
          <Button>
            <BarChart3 className="h-4 w-4 mr-2" />
            {t('page.reports')}
          </Button>
        </div>
      </div>

      {/* Sélection de classe */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {t('page.selectedClass')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-4">
              <LoadingSpinner />
            </div>
          ) : classes.length > 0 ? (
            <div className="flex gap-2 flex-wrap">
              {classes.map(cls => (
                <Button
                  key={cls.id}
                  onClick={() => setSelectedClass(cls)}
                  variant={selectedClass?.id === cls.id ? 'default' : 'outline'}
                  className="flex items-center gap-2"
                >
                  {cls.name}
                  <Badge variant="secondary">{cls.student_count || 0}</Badge>
                </Button>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">{t('page.noClass')}</p>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="quick" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="quick" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            {t('page.tabQuick')}
          </TabsTrigger>
          <TabsTrigger value="scanner" className="flex items-center gap-2">
            <Scan className="h-4 w-4" />
            {t('page.tabScanner')}
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            {t('page.tabHistory')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="quick" className="space-y-6">
          {selectedClass ? (
            isRosterLoading ? (
              <div className="flex justify-center py-8">
                <LoadingSpinner />
              </div>
            ) : (
              <QuickAttendance
                classId={selectedClass.id}
                institutionId={selectedClass.institution_id}
                students={rosterStudents}
                onAttendanceSubmitted={handleAttendanceMarked}
              />
            )
          ) : (
            <p className="text-muted-foreground">{t('page.selectClass')}</p>
          )}
        </TabsContent>

        <TabsContent value="scanner" className="space-y-6">
          {selectedClass ? (
            <div className="grid md:grid-cols-2 gap-6">
              <AttendanceScanner
                classId={selectedClass.id}
                institutionId={selectedClass.institution_id}
                students={rosterStudents}
                onAttendanceMarked={handleAttendanceMarked}
              />
            
            <Card>
              <CardHeader>
                <CardTitle>{t('page.recentTitle')}</CardTitle>
                <CardDescription>
                  {t('page.recentDescription')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {attendanceData.slice(-5).map((attendance, index) => (
                    <div key={index} className="flex items-center justify-between p-2 border rounded">
                      <span className="text-sm">{attendance.student_id}</span>
                      <Badge variant={attendance.type === 'absence' ? 'destructive' : 'secondary'}>
                        {attendance.type === 'absence' ? t('page.recentAbsent') : t('page.recentLate')}
                      </Badge>
                    </div>
                  ))}
                  {attendanceData.length === 0 && (
                    <p className="text-muted-foreground text-sm">{t('page.recentEmpty')}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
          ) : (
            <p className="text-muted-foreground">{t('page.selectClass')}</p>
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-6">
          {selectedClass ? (
            <AttendanceHistory
              classId={selectedClass.id}
              className={selectedClass.name}
              students={rosterStudents}
              refreshKey={historyRefreshKey}
            />
          ) : (
            <p className="text-muted-foreground">{t('page.selectClass')}</p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AttendanceManagement;
