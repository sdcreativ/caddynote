import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BookOpen, CalendarDays, ChevronDown, Clock, User, UserCheck, UserX } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { StrkAttendance } from '@/services/strkAttendanceService';
import {
  formatSessionDateLabel,
  formatSessionTimeRange,
  groupAttendanceBySession,
  type AttendanceSessionGroup,
} from '@/lib/attendanceSessionGroups';

type Props = {
  records: StrkAttendance[];
  /** Résout le nom élève si `student_name` est absent (ex. roster direction). */
  resolveStudentName?: (record: StrkAttendance) => string;
  /** Nombre de séances ouvertes par défaut (les plus récentes). */
  defaultOpenCount?: number;
  showTeacher?: boolean;
  emptyMessage?: string;
};

export function AttendanceSessionGroups({
  records,
  resolveStudentName,
  defaultOpenCount = 3,
  showTeacher = true,
  emptyMessage,
}: Props) {
  const { t } = useTranslation('attendance');
  const groups = useMemo(() => groupAttendanceBySession(records), [records]);
  const [openKeys, setOpenKeys] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setOpenKeys(new Set(groups.slice(0, defaultOpenCount).map((g) => g.key)));
  }, [groups, defaultOpenCount]);

  const toggle = (key: string) => {
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (groups.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {emptyMessage || t('history.emptyBody')}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {t('history.sessionCount', { count: groups.length })}
      </p>
      {groups.map((group) => (
        <SessionBlock
          key={group.key}
          group={group}
          open={openKeys.has(group.key)}
          onToggle={() => toggle(group.key)}
          resolveStudentName={resolveStudentName}
          showTeacher={showTeacher}
        />
      ))}
    </div>
  );
}

function SessionBlock({
  group,
  open,
  onToggle,
  resolveStudentName,
  showTeacher,
}: {
  group: AttendanceSessionGroup;
  open: boolean;
  onToggle: () => void;
  resolveStudentName?: (record: StrkAttendance) => string;
  showTeacher: boolean;
}) {
  const { t } = useTranslation('attendance');
  const timeRange = formatSessionTimeRange(group.startTime, group.endTime);
  const dateLabel = formatSessionDateLabel(group.date);
  const teacher = showTeacher ? group.teacherName : undefined;

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-start gap-3 px-4 py-4 text-left transition-colors hover:bg-slate-50/90"
      >
        <ChevronDown
          className={cn(
            'mt-1 h-4 w-4 shrink-0 text-slate-400 transition-transform',
            open && 'rotate-180'
          )}
          aria-hidden
        />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-base font-semibold text-slate-900">
                <BookOpen className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                <span className="truncate">{group.courseName || t('history.unknownCourse')}</span>
              </p>
              {group.className ? (
                <p className="mt-0.5 pl-6 text-sm text-slate-500">{group.className}</p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {group.absentCount > 0 ? (
                <Badge variant="destructive" className="tabular-nums">
                  {t('history.absentCount', { count: group.absentCount })}
                </Badge>
              ) : null}
              {group.lateCount > 0 ? (
                <Badge variant="secondary" className="tabular-nums">
                  {t('history.lateCount', { count: group.lateCount })}
                </Badge>
              ) : null}
              {group.absentCount === 0 && group.lateCount === 0 ? (
                <Badge variant="outline" className="tabular-nums">
                  {t('history.recordCount', { count: group.records.length })}
                </Badge>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap gap-x-3 gap-y-1 pl-6 text-sm text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5 text-slate-400" aria-hidden />
              {dateLabel}
            </span>
            {timeRange ? (
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                {timeRange}
              </span>
            ) : null}
            {teacher ? (
              <span className="inline-flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                {t('history.teacherLabel', { name: teacher })}
              </span>
            ) : null}
          </div>
        </div>
      </button>

      {open ? (
        <ul className="divide-y divide-slate-100 border-t border-slate-100 bg-slate-50/40">
          {group.records.map((record) => {
            const name =
              resolveStudentName?.(record) ||
              record.student_name ||
              t('history.unknownStudent');
            const isAbsence = record.type === 'absence';
            return (
              <li
                key={record.id}
                className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div
                    className={cn(
                      'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                      isAbsence ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-800'
                    )}
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
                      {[
                        record.duration ? `${record.duration} min` : null,
                        record.reason
                          ? t('history.reason', { reason: record.reason })
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · ') || t('history.noReason')}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 pl-12 sm:pl-0 sm:justify-end">
                  <Badge variant={isAbsence ? 'destructive' : 'secondary'}>
                    {isAbsence ? t('page.recentAbsent') : t('page.recentLate')}
                    {record.justified ? ` · ${t('history.justified').toLowerCase()}` : ''}
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
      ) : null}
    </section>
  );
}
