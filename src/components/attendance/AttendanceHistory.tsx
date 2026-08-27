import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { AttendanceSessionGroups } from '@/components/attendance/AttendanceSessionGroups';
import {
  filterAttendanceByPeriod,
  type AttendanceHistoryPeriod,
} from '@/lib/attendanceSessionGroups';
import {
  fetchAttendanceHistoryByClass,
  type ClassRosterStudent,
  type StrkAttendance,
} from '@/services/strkAttendanceService';

type Props = {
  classId: string;
  className: string;
  students: ClassRosterStudent[];
  refreshKey?: number;
};

export function AttendanceHistory({ classId, className, students, refreshKey = 0 }: Props) {
  const { t } = useTranslation('attendance');
  const [records, setRecords] = useState<StrkAttendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'absence' | 'lateness'>('all');
  const [period, setPeriod] = useState<AttendanceHistoryPeriod>('30d');

  const nameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of students) map.set(s.id, s.name);
    return map;
  }, [students]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const list = await fetchAttendanceHistoryByClass(classId);
      if (!cancelled) {
        setRecords(list);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [classId, refreshKey]);

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const inPeriod = filterAttendanceByPeriod(records, period);
    return inPeriod.filter((r) => {
      const name = nameById.get(r.student_id) || r.student_name || '';
      const course = (r.course_name || '').toLowerCase();
      const teacher = (r.teacher_name || r.recorded_by_name || '').toLowerCase();
      const matchesSearch =
        q === '' ||
        name.toLowerCase().includes(q) ||
        course.includes(q) ||
        teacher.includes(q) ||
        r.student_id.toLowerCase().includes(q) ||
        (r.reason || '').toLowerCase().includes(q);
      const matchesType = filterType === 'all' || r.type === filterType;
      return matchesSearch && matchesType;
    });
  }, [records, searchTerm, filterType, nameById, period]);

  const absentCount = records.filter((r) => r.type === 'absence').length;
  const lateCount = records.filter((r) => r.type === 'lateness').length;
  const justifiedCount = records.filter((r) => r.justified).length;

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="space-y-4">
        <div>
          <CardTitle>{t('page.historyTitle')}</CardTitle>
          <CardDescription>{t('page.historyForClass', { className })}</CardDescription>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
            <p className="text-xs font-medium text-slate-500">{t('history.statAbsences')}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{absentCount}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
            <p className="text-xs font-medium text-slate-500">{t('history.statLates')}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{lateCount}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
            <p className="text-xs font-medium text-slate-500">{t('history.statJustified')}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{justifiedCount}</p>
          </div>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-xs">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t('history.searchPlaceholderExtended')}
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
            <Select
              value={filterType}
              onValueChange={(v) => setFilterType(v as 'all' | 'absence' | 'lateness')}
            >
              <SelectTrigger className="w-full sm:w-[160px]" aria-label={t('history.filterType')}>
                <SelectValue placeholder={t('history.filterType')} />
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
        {loading ? (
          <div className="flex justify-center py-10">
            <LoadingSpinner />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title={records.length === 0 ? t('history.emptyTitle') : t('history.noResultTitle')}
            description={
              records.length === 0 ? t('history.emptyBody') : t('history.noResultBody')
            }
          />
        ) : (
          <AttendanceSessionGroups
            records={filtered}
            resolveStudentName={(r) =>
              nameById.get(r.student_id) || r.student_name || t('history.unknownStudent')
            }
            showTeacher
            defaultOpenCount={3}
          />
        )}
      </CardContent>
    </Card>
  );
}
