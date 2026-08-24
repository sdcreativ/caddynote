import { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Calendar, Plus, Filter, Printer } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useStrkAuth } from '@/hooks/useStrkAuth';
import { useStrkSchedules } from '@/hooks/useStrkSchedules';
import { useGuardianChildren } from '@/hooks/useGuardianChildren';
import { useQuickActions } from '@/components/quick-actions/QuickActionsManager';
import { fetchStudentCountByClass } from '@/services/strkClassService';
import EventDetailDialog from '@/components/calendar/EventDetailDialog';
import type { StrkSchedule } from '@/types/strk';
import type { Event as CalendarDetailEvent } from '@/types/calendar';

const STAFF_INSTITUTION_ROLES = new Set([
  'school_admin',
  'secretary',
  'supervisor',
  'admin',
]);

const parseLocalYmd = (ymd: string): Date => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

const formatLocalYmd = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

type ScheduleExtras = StrkSchedule & {
  class?: { name?: string };
  teacher?: { first_name?: string | null; last_name?: string | null };
};

type CalendarEvent = {
  id: string;
  scheduleId: string;
  title: string;
  type: 'course';
  time: string;
  startTime: string;
  endTime: string;
  room: string;
  students: number;
  date: string;
  className: string;
  teacherName: string;
  description?: string;
};

const personName = (p?: { first_name?: string | null; last_name?: string | null } | null) =>
  `${p?.first_name ?? ''} ${p?.last_name ?? ''}`.trim();

const scheduleToEvent = (
  schedule: StrkSchedule,
  date: string,
  studentCounts: Record<string, number>,
  courseFallback: string,
  roomFallback: string
): CalendarEvent => {
  const s = schedule as ScheduleExtras;
  const teacherName = personName(s.teacher) || personName(s.course?.teacher) || '—';
  return {
    id: `${schedule.id}-${date}`,
    scheduleId: schedule.id,
    title: schedule.course?.name || courseFallback,
    type: 'course',
    time: `${schedule.start_time}-${schedule.end_time}`,
    startTime: schedule.start_time,
    endTime: schedule.end_time,
    room: schedule.room || schedule.course?.room || roomFallback,
    students: schedule.class_id ? studentCounts[schedule.class_id] || 0 : 0,
    date,
    className: s.class?.name || '—',
    teacherName,
    description: schedule.course?.description || undefined,
  };
};

const toDetailEvent = (event: CalendarEvent): CalendarDetailEvent => ({
  id: event.scheduleId,
  title: event.title,
  date: parseLocalYmd(event.date),
  startTime: event.startTime,
  endTime: event.endTime,
  type: 'cours',
  className: event.className,
  teacherName: event.teacherName,
  location: event.room,
  description: event.description,
});

const CalendarPage = () => {
  const { t } = useTranslation('calendar');
  const { t: tc } = useTranslation('common');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [studentCounts, setStudentCounts] = useState<Record<string, number>>({});
  const [detailEvent, setDetailEvent] = useState<CalendarDetailEvent | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const { user } = useStrkAuth();
  const {
    schedules,
    isLoading,
    loadSchedulesByStudent,
    loadSchedulesByTeacher,
    loadSchedulesByInstitution,
    removeSchedule,
  } = useStrkSchedules();
  const { openEventDialog } = useQuickActions();
  const isParent = user?.role === 'parent';
  const {
    children,
    selectedChildId,
    selectedChild,
    setSelectedChildId,
    isLoading: childrenLoading,
  } = useGuardianChildren();

  const loadersRef = useRef({
    loadSchedulesByStudent,
    loadSchedulesByTeacher,
    loadSchedulesByInstitution,
  });
  loadersRef.current = {
    loadSchedulesByStudent,
    loadSchedulesByTeacher,
    loadSchedulesByInstitution,
  };

  useEffect(() => {
    if (!user) return;
    const loaders = loadersRef.current;

    if (user.role === 'student') {
      void loaders.loadSchedulesByStudent(user.id);
      return;
    }
    if (user.role === 'teacher' || user.role === 'head_teacher') {
      void loaders.loadSchedulesByTeacher(user.id);
      return;
    }
    if (user.role === 'parent') {
      if (selectedChildId) void loaders.loadSchedulesByStudent(selectedChildId);
      return;
    }
    if (user.institutionId && STAFF_INSTITUTION_ROLES.has(user.role)) {
      void loaders.loadSchedulesByInstitution(user.institutionId);
    }
  }, [user?.id, user?.role, user?.institutionId, selectedChildId]);

  const classIdsKey = useMemo(
    () =>
      [...new Set(schedules.map((s) => s.class_id).filter(Boolean))]
        .sort()
        .join(','),
    [schedules]
  );

  useEffect(() => {
    let cancelled = false;
    const classIds = classIdsKey ? classIdsKey.split(',') : [];
    if (classIds.length === 0) {
      setStudentCounts({});
      return;
    }
    void (async () => {
      const counts: Record<string, number> = {};
      await Promise.all(
        classIds.map(async (classId) => {
          counts[classId] = await fetchStudentCountByClass(classId);
        })
      );
      if (!cancelled) setStudentCounts(counts);
    })();
    return () => {
      cancelled = true;
    };
  }, [classIdsKey]);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const courseFallback = t('courseFallback');
  const roomFallback = t('roomUndefined');

  const monthEvents = useMemo(() => {
    const list: CalendarEvent[] = [];
    for (const schedule of schedules) {
      const dow = Number(schedule.day_of_week);
      for (let day = 1; day <= daysInMonth; day++) {
        const dayDate = new Date(year, month, day);
        if (dayDate.getDay() !== dow) continue;
        list.push(
          scheduleToEvent(schedule, formatLocalYmd(dayDate), studentCounts, courseFallback, roomFallback)
        );
      }
    }
    return list;
  }, [schedules, studentCounts, year, month, daysInMonth, courseFallback, roomFallback]);

  const today = new Date();
  const todayYmd = formatLocalYmd(today);

  const upcomingEvents = useMemo(() => {
    const list: CalendarEvent[] = [];
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    for (let offset = 0; offset < 28; offset++) {
      const dayDate = new Date(start);
      dayDate.setDate(start.getDate() + offset);
      const dow = dayDate.getDay();
      const ymd = formatLocalYmd(dayDate);
      for (const schedule of schedules) {
        if (Number(schedule.day_of_week) !== dow) continue;
        list.push(scheduleToEvent(schedule, ymd, studentCounts, courseFallback, roomFallback));
      }
    }
    return list
      .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
      .slice(0, 8);
  }, [schedules, studentCounts, todayYmd, courseFallback, roomFallback]);

  const openDetails = (event: CalendarEvent, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setDetailEvent(toDetailEvent(event));
    setDetailOpen(true);
  };

  const monthNames = t('months', { returnObjects: true }) as string[];
  const daysOfWeekLabels = t('daysOfWeek', { returnObjects: true }) as string[];

  const getDaysInMonth = (date: Date) => {
    const y = date.getFullYear();
    const m = date.getMonth();
    const firstDay = new Date(y, m, 1);
    const lastDay = new Date(y, m + 1, 0);
    const dim = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();
    const days: Array<{ date: Date; isCurrentMonth: boolean; events: CalendarEvent[] }> = [];

    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
      days.push({ date: new Date(y, m, -i), isCurrentMonth: false, events: [] });
    }

    for (let day = 1; day <= dim; day++) {
      const dayDate = new Date(y, m, day);
      const ymd = formatLocalYmd(dayDate);
      days.push({
        date: dayDate,
        isCurrentMonth: true,
        events: monthEvents.filter((event) => event.date === ymd),
      });
    }

    const remainingDays = 42 - days.length;
    for (let day = 1; day <= remainingDays; day++) {
      days.push({ date: new Date(y, m + 1, day), isCurrentMonth: false, events: [] });
    }

    return days;
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentDate((prevDate) => {
      const newDate = new Date(prevDate);
      newDate.setMonth(newDate.getMonth() + (direction === 'prev' ? -1 : 1));
      return newDate;
    });
  };

  const getEventTypeColor = (type: string) => {
    switch (type) {
      case 'course':
        return 'bg-blue-500 text-white';
      case 'meeting':
        return 'bg-green-500 text-white';
      case 'event':
        return 'bg-purple-500 text-white';
      default:
        return 'bg-gray-500 text-white';
    }
  };

  const days = getDaysInMonth(currentDate);
  const canManageEvents = !!user && STAFF_INSTITUTION_ROLES.has(user.role);
  const subtitle =
    isParent && selectedChild
      ? t('subtitleParent', {
          name: `${selectedChild.firstName ?? ''} ${selectedChild.lastName ?? ''}`.trim(),
        })
      : t('subtitle');

  const showInitialLoading =
    (isLoading && schedules.length === 0) || (isParent && childrenLoading && !selectedChildId);

  return (
    <div className="space-y-6 py-6 animate-fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0 print-hidden">
        <div>
          <h1 className="text-3xl font-bold">{t('title')}</h1>
          <p className="text-gray-500 mt-1">{subtitle}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {isParent && children.length > 0 && (
            <Select
              value={selectedChildId ?? undefined}
              onValueChange={setSelectedChildId}
              disabled={childrenLoading}
            >
              <SelectTrigger className="w-[220px]" aria-label={t('childSelect')}>
                <SelectValue placeholder={t('childSelect')} />
              </SelectTrigger>
              <SelectContent>
                {children.map((child) => (
                  <SelectItem key={child.studentId} value={child.studentId}>
                    {child.firstName} {child.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" onClick={() => setCurrentDate(new Date())}>
            {t('today')}
          </Button>
          <Button variant="outline">
            <Filter className="mr-2 h-4 w-4" />
            {tc('actions.filter')}
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" />
            {t('print')}
          </Button>
          {canManageEvents && (
            <Button onClick={() => openEventDialog()}>
              <Plus className="mr-2 h-5 w-5" />
              {t('newEvent')}
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="text-2xl">
              {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
            </CardTitle>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => navigateMonth('prev')}
                aria-label={t('prevMonth')}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => navigateMonth('next')}
                aria-label={t('nextMonth')}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {showInitialLoading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">{t('loading')}</p>
          ) : null}
          <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-lg overflow-hidden">
            {daysOfWeekLabels.map((day) => (
              <div key={day} className="bg-gray-50 p-3 text-center text-sm font-medium text-gray-700">
                {day}
              </div>
            ))}

            {days.map((day, index) => {
              const isToday = day.date.toDateString() === today.toDateString();
              return (
                <div
                  key={index}
                  className={`bg-white p-2 min-h-[120px] border-r border-b border-gray-100 ${
                    !day.isCurrentMonth ? 'text-gray-400 bg-gray-50' : ''
                  } ${isToday ? 'bg-blue-50 border-blue-200' : ''} ${
                    day.isCurrentMonth && canManageEvents ? 'cursor-pointer hover:bg-gray-50' : ''
                  }`}
                  onClick={() => day.isCurrentMonth && canManageEvents && openEventDialog(day.date)}
                >
                  <div
                    className={`text-sm font-medium mb-1 ${
                      isToday
                        ? 'text-blue-600 bg-blue-100 rounded-full w-6 h-6 flex items-center justify-center'
                        : ''
                    }`}
                  >
                    {day.date.getDate()}
                  </div>
                  <div className="space-y-1">
                    {day.events.slice(0, 3).map((event) => (
                      <button
                        key={event.id}
                        type="button"
                        className={`w-full text-left text-xs p-1 rounded text-white truncate ${getEventTypeColor(event.type)}`}
                        title={t('eventTitle', { title: event.title, time: event.time })}
                        onClick={(e) => openDetails(event, e)}
                      >
                        {event.time.split('-')[0]} {event.title}
                      </button>
                    ))}
                    {day.events.length > 3 && (
                      <div className="text-xs text-gray-500 font-medium">
                        {t('moreEvents', { count: day.events.length - 3 })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            {t('upcoming')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {showInitialLoading ? (
              <p className="text-sm text-muted-foreground">{t('loading')}</p>
            ) : upcomingEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('emptyUpcoming')}</p>
            ) : (
              upcomingEvents.map((event) => (
                <div key={event.id} className="flex items-center justify-between gap-3 p-3 border rounded-lg">
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className={`h-3 w-3 shrink-0 rounded-full ${getEventTypeColor(event.type).split(' ')[0]}`}
                    />
                    <div className="min-w-0">
                      <p className="font-medium">{event.title}</p>
                      <p className="truncate text-sm text-gray-500">
                        {parseLocalYmd(event.date).toLocaleDateString('fr-FR')} • {event.time} •{' '}
                        {event.room}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {event.students > 0 && (
                      <Badge variant="secondary">{t('studentsCount', { count: event.students })}</Badge>
                    )}
                    <Button variant="outline" size="sm" onClick={() => openDetails(event)}>
                      {t('details')}
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <EventDetailDialog
        event={detailEvent}
        open={detailOpen}
        onOpenChange={(open) => {
          setDetailOpen(open);
          if (!open) setDetailEvent(null);
        }}
        onDelete={
          canManageEvents
            ? (scheduleId) => {
                void removeSchedule(scheduleId).then(() => {
                  setDetailOpen(false);
                  setDetailEvent(null);
                });
              }
            : undefined
        }
      />
    </div>
  );
};

export default CalendarPage;
