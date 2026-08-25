import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, Search, UserX, UserCheck } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
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
    return records.filter((r) => {
      const name = nameById.get(r.student_id) || '';
      const matchesSearch =
        q === '' ||
        name.toLowerCase().includes(q) ||
        r.student_id.toLowerCase().includes(q) ||
        (r.reason || '').toLowerCase().includes(q);
      const matchesType = filterType === 'all' || r.type === filterType;
      return matchesSearch && matchesType;
    });
  }, [records, searchTerm, filterType, nameById]);

  const absentCount = records.filter((r) => r.type === 'absence').length;
  const lateCount = records.filter((r) => r.type === 'lateness').length;
  const justifiedCount = records.filter((r) => r.justified).length;

  return (
    <Card>
      <CardHeader className="space-y-4">
        <div>
          <CardTitle>{t('page.historyTitle')}</CardTitle>
          <CardDescription>{t('page.historyForClass', { className })}</CardDescription>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3">
            <p className="text-xs font-medium text-slate-500">{t('history.statAbsences')}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{absentCount}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3">
            <p className="text-xs font-medium text-slate-500">{t('history.statLates')}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{lateCount}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3">
            <p className="text-xs font-medium text-slate-500">{t('history.statJustified')}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{justifiedCount}</p>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t('history.searchPlaceholder')}
              className="pl-9"
              aria-label={t('history.searchPlaceholder')}
            />
          </div>
          <Select
            value={filterType}
            onValueChange={(v) => setFilterType(v as 'all' | 'absence' | 'lateness')}
          >
            <SelectTrigger className="w-full sm:w-[180px]" aria-label={t('history.filterType')}>
              <SelectValue placeholder={t('history.filterType')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('history.filterAll')}</SelectItem>
              <SelectItem value="absence">{t('history.filterAbsence')}</SelectItem>
              <SelectItem value="lateness">{t('history.filterLateness')}</SelectItem>
            </SelectContent>
          </Select>
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
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {filtered.map((record) => {
              const name = nameById.get(record.student_id) || t('history.unknownStudent');
              const isAbsence = record.type === 'absence';
              return (
                <li
                  key={record.id}
                  className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                        isAbsence ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {isAbsence ? (
                        <UserX className="h-4 w-4" aria-hidden />
                      ) : (
                        <Clock className="h-4 w-4" aria-hidden />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">{name}</p>
                      <p className="text-sm text-slate-500">
                        {record.reason
                          ? t('history.reason', { reason: record.reason })
                          : t('history.noReason')}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <span className="text-sm text-slate-500">
                      {new Date(record.date).toLocaleDateString('fr-FR')}
                    </span>
                    <Badge variant={isAbsence ? 'destructive' : 'secondary'}>
                      {isAbsence ? t('page.recentAbsent') : t('page.recentLate')}
                    </Badge>
                    {record.justified ? (
                      <Badge variant="outline" className="gap-1">
                        <UserCheck className="h-3 w-3" aria-hidden />
                        {t('history.justified')}
                      </Badge>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
