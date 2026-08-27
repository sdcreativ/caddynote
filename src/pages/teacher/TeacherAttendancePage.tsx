import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, Search } from 'lucide-react';
import { useStrkAuth } from '@/hooks/useStrkAuth';
import { useStrkCourses } from '@/hooks/useStrkCourses';
import {
  fetchAttendanceHistoryForCourses,
  type StrkAttendance,
} from '@/services/strkAttendanceService';
import { AttendanceDialog } from '@/components/attendance/AttendanceDialog';
import { AttendanceSessionGroups } from '@/components/attendance/AttendanceSessionGroups';
import { PresenceHubTabs } from '@/components/attendance/PresenceHubTabs';
import {
  filterAttendanceByPeriod,
  type AttendanceHistoryPeriod,
} from '@/lib/attendanceSessionGroups';
import { useSearchParams } from 'react-router-dom';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';

export default function TeacherAttendancePage() {
  const { t } = useTranslation('attendance');
  const { user } = useStrkAuth();
  const { courses, loadCoursesByTeacher } = useStrkCourses();
  const [searchParams] = useSearchParams();
  const courseParam = searchParams.get('course');

  const [attendanceRecords, setAttendanceRecords] = useState<StrkAttendance[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCourse, setSelectedCourse] = useState(courseParam || 'all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'absence' | 'lateness'>('all');
  const [period, setPeriod] = useState<AttendanceHistoryPeriod>('30d');
  const [showAttendanceDialog, setShowAttendanceDialog] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (user?.id && (user.role === 'teacher' || user.role === 'head_teacher')) {
      loadCoursesByTeacher(user.id);
    }
  }, [user, loadCoursesByTeacher]);

  useEffect(() => {
    if (courseParam && courses.some((c) => c.id === courseParam)) {
      setSelectedCourse(courseParam);
    }
  }, [courseParam, courses]);

  const reloadHistory = async () => {
    if (courses.length === 0) {
      setAttendanceRecords([]);
      return;
    }

    const targetCourses =
      selectedCourse === 'all' ? courses : courses.filter((c) => c.id === selectedCourse);

    if (targetCourses.length === 0) {
      setAttendanceRecords([]);
      return;
    }

    setIsLoading(true);
    try {
      const courseNameById = new Map(courses.map((c) => [c.id, c.name]));
      const records = await fetchAttendanceHistoryForCourses(
        targetCourses.map((c) => c.id),
        {
          classIds: targetCourses.map((c) => c.class_id).filter((id): id is string => !!id),
          courseNameById,
        }
      );
      setAttendanceRecords(records);
    } catch (error) {
      console.error('Error loading attendance:', error);
      setAttendanceRecords([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void reloadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when course filter or catalogue change
  }, [selectedCourse, courses]);

  const filteredRecords = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const inPeriod = filterAttendanceByPeriod(attendanceRecords, period);
    return inPeriod.filter((record) => {
      const name = (record.student_name || '').toLowerCase();
      const course = (record.course_name || '').toLowerCase();
      const teacher = (record.teacher_name || record.recorded_by_name || '').toLowerCase();
      const matchesSearch =
        q === '' ||
        name.includes(q) ||
        course.includes(q) ||
        teacher.includes(q) ||
        record.student_id.toLowerCase().includes(q);
      const matchesStatus = filterStatus === 'all' || record.type === filterStatus;
      return matchesSearch && matchesStatus;
    });
  }, [attendanceRecords, searchTerm, filterStatus, period]);

  const absentStudents = attendanceRecords.filter((r) => r.type === 'absence').length;
  const lateStudents = attendanceRecords.filter((r) => r.type === 'lateness').length;
  const justifiedCount = attendanceRecords.filter((r) => r.justified).length;

  return (
    <div className="space-y-6 py-6 animate-fade-in">
      <PresenceHubTabs />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('teacher.title')}</h1>
          <p className="mt-1 text-muted-foreground">{t('teacher.subtitle')}</p>
        </div>
        <Button onClick={() => setShowAttendanceDialog(true)} className="shrink-0">
          <Calendar className="mr-2 h-4 w-4" />
          {t('teacher.takeRoll')}
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs font-medium text-slate-500">{t('history.statAbsences')}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{absentStudents}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs font-medium text-slate-500">{t('history.statLates')}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{lateStudents}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs font-medium text-slate-500">{t('history.statJustified')}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{justifiedCount}</p>
        </div>
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="space-y-4">
          <div>
            <CardTitle>{t('teacher.historyTitle')}</CardTitle>
            <CardDescription>{t('teacher.historyDescription')}</CardDescription>
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-xs">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
              <Input
                type="text"
                placeholder={t('history.searchPlaceholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
                aria-label={t('history.searchPlaceholder')}
              />
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Select value={period} onValueChange={(v) => setPeriod(v as AttendanceHistoryPeriod)}>
                <SelectTrigger className="w-full sm:w-[160px]" aria-label={t('history.filterPeriod')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">{t('history.periodToday')}</SelectItem>
                  <SelectItem value="7d">{t('history.period7d')}</SelectItem>
                  <SelectItem value="30d">{t('history.period30d')}</SelectItem>
                  <SelectItem value="all">{t('history.periodAll')}</SelectItem>
                </SelectContent>
              </Select>

              <Select value={selectedCourse} onValueChange={setSelectedCourse}>
                <SelectTrigger className="w-full sm:w-[200px]" aria-label={t('history.filterCourse')}>
                  <SelectValue placeholder={t('history.filterCourse')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('history.allCourses')}</SelectItem>
                  {courses.map((course) => (
                    <SelectItem key={course.id} value={course.id}>
                      {course.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={filterStatus}
                onValueChange={(v) => setFilterStatus(v as 'all' | 'absence' | 'lateness')}
              >
                <SelectTrigger className="w-full sm:w-[150px]" aria-label={t('history.filterType')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('history.filterAll')}</SelectItem>
                  <SelectItem value="absence">{t('history.filterAbsence')}</SelectItem>
                  <SelectItem value="lateness">{t('history.filterLateness')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-10">
              <LoadingSpinner />
            </div>
          ) : filteredRecords.length > 0 ? (
            <AttendanceSessionGroups
              records={filteredRecords}
              showTeacher={selectedCourse === 'all'}
              defaultOpenCount={3}
            />
          ) : (
            <EmptyState
              title={
                courses.length === 0
                  ? t('teacher.noCoursesTitle')
                  : attendanceRecords.length === 0
                    ? t('history.emptyTitle')
                    : t('history.noResultTitle')
              }
              description={
                courses.length === 0
                  ? t('teacher.noCoursesBody')
                  : attendanceRecords.length === 0
                    ? t('history.emptyBody')
                    : t('history.noResultBody')
              }
            />
          )}
        </CardContent>
      </Card>

      <AttendanceDialog
        open={showAttendanceDialog}
        onOpenChange={setShowAttendanceDialog}
        courses={courses}
        institutionId={user?.institutionId}
        onAttendanceSubmitted={() => {
          void reloadHistory();
        }}
      />
    </div>
  );
}
