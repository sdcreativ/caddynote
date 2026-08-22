
import { useState, useEffect } from 'react';
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

const STAFF_INSTITUTION_ROLES = new Set([
  'school_admin',
  'secretary',
  'supervisor',
  'admin',
]);

const CalendarPage = () => {
  const { t } = useTranslation('calendar');
  const { t: tc } = useTranslation('common');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [studentCounts, setStudentCounts] = useState<Record<string, number>>({});
  const { user } = useStrkAuth();
  const {
    schedules,
    isLoading,
    loadSchedulesByStudent,
    loadSchedulesByTeacher,
    loadSchedulesByInstitution,
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

  useEffect(() => {
    if (!user) return;

    if (user.role === 'student') {
      loadSchedulesByStudent(user.id);
      return;
    }
    if (user.role === 'teacher' || user.role === 'head_teacher') {
      loadSchedulesByTeacher(user.id);
      return;
    }
    if (user.role === 'parent') {
      if (selectedChildId) loadSchedulesByStudent(selectedChildId);
      return;
    }
    if (user.institutionId && STAFF_INSTITUTION_ROLES.has(user.role)) {
      loadSchedulesByInstitution(user.institutionId);
    }
  }, [
    user,
    selectedChildId,
    loadSchedulesByStudent,
    loadSchedulesByTeacher,
    loadSchedulesByInstitution,
  ]);

  // Fetch student counts for each class when schedules change
  useEffect(() => {
    const fetchStudentCounts = async () => {
      const counts: Record<string, number> = {};

      // Get unique class IDs from schedules
      const classIds = [...new Set(schedules
        .filter(schedule => schedule.class_id)
        .map(schedule => schedule.class_id))];

      // Fetch student count for each class
      for (const classId of classIds) {
        counts[classId] = await fetchStudentCountByClass(classId);
      }

      setStudentCounts(counts);
    };

    if (schedules.length > 0) {
      fetchStudentCounts();
    }
  }, [schedules]);

  // Convertir les emplois du temps en événements de calendrier
  const events = schedules.map((schedule) => {
    // Calculer la vraie date selon day_of_week
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    // Trouver le premier jour du mois
    const firstDayOfMonth = new Date(year, month, 1);

    // Calculer le nombre de jours à ajouter pour atteindre le jour de la semaine souhaité
    let daysToAdd = schedule.day_of_week - firstDayOfMonth.getDay();
    if (daysToAdd < 0) daysToAdd += 7;

    // Créer la date pour ce jour de la semaine
    const eventDate = new Date(year, month, 1 + daysToAdd);

    // Si la date est dans le passé, prendre la semaine suivante
    const today = new Date();
    if (eventDate < today && eventDate.getMonth() === today.getMonth()) {
      eventDate.setDate(eventDate.getDate() + 7);
    }

    // Récupérer le nombre d'étudiants à partir de la base de données
    const studentCount = schedule.class_id ? studentCounts[schedule.class_id] || 0 : 0;

    return {
      id: schedule.id,
      title: schedule.course?.name || t('courseFallback'),
      type: 'course',
      date: eventDate.toISOString().split('T')[0],
      time: `${schedule.start_time}-${schedule.end_time}`,
      room: schedule.room || schedule.course?.room || t('roomUndefined'),
      students: studentCount
    };
  });

  const monthNames = t('months', { returnObjects: true }) as string[];
  const daysOfWeek = t('daysOfWeek', { returnObjects: true }) as string[];

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days = [];

    // Jours du mois précédent
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
      const prevMonthDay = new Date(year, month, -i);
      days.push({
        date: prevMonthDay,
        isCurrentMonth: false,
        events: []
      });
    }

    // Jours du mois actuel
    for (let day = 1; day <= daysInMonth; day++) {
      const dayDate = new Date(year, month, day);
      const dayEvents = events.filter(event => {
        const eventDate = new Date(event.date);
        return eventDate.toDateString() === dayDate.toDateString();
      });

      days.push({
        date: dayDate,
        isCurrentMonth: true,
        events: dayEvents
      });
    }

    // Jours du mois suivant pour compléter la grille
    const remainingDays = 42 - days.length; // 6 semaines * 7 jours
    for (let day = 1; day <= remainingDays; day++) {
      const nextMonthDay = new Date(year, month + 1, day);
      days.push({
        date: nextMonthDay,
        isCurrentMonth: false,
        events: []
      });
    }

    return days;
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentDate(prevDate => {
      const newDate = new Date(prevDate);
      if (direction === 'prev') {
        newDate.setMonth(newDate.getMonth() - 1);
      } else {
        newDate.setMonth(newDate.getMonth() + 1);
      }
      return newDate;
    });
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const getEventTypeColor = (type: string) => {
    switch (type) {
      case 'course': return 'bg-blue-500 text-white';
      case 'meeting': return 'bg-green-500 text-white';
      case 'event': return 'bg-purple-500 text-white';
      default: return 'bg-gray-500 text-white';
    }
  };

  const days = getDaysInMonth(currentDate);
  const today = new Date();
  const canManageEvents = !!user && STAFF_INSTITUTION_ROLES.has(user.role);
  const subtitle =
    isParent && selectedChild
      ? t('subtitleParent', {
          name: `${selectedChild.firstName ?? ''} ${selectedChild.lastName ?? ''}`.trim(),
        })
      : t('subtitle');

  return (
    <div className="space-y-6 py-6 animate-fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0 print-hidden">
        <div>
          <h1 className="text-3xl font-bold">{t('title')}</h1>
          <p className="text-gray-500 mt-1">
            {subtitle}
          </p>
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
          <Button variant="outline" onClick={goToToday}>
            {t('today')}
          </Button>
          <Button variant="outline">
            <Filter className="mr-2 h-4 w-4" />
            {tc('actions.filter')}
          </Button>
          {/* ACA-003 : impression — l'affichage à l'écran (grille + événements
              à venir) sert directement de support, pas de vue dédiée séparée. */}
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

      {/* Navigation du calendrier */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="text-2xl">
              {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
            </CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="icon" onClick={() => navigateMonth('prev')} aria-label={t('prevMonth')}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={() => navigateMonth('next')} aria-label={t('nextMonth')}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading || (isParent && childrenLoading) ? (
            <p className="text-sm text-muted-foreground py-8 text-center">{t('loading')}</p>
          ) : null}
          {/* Grille du calendrier */}
          <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-lg overflow-hidden">
            {/* En-têtes des jours */}
            {daysOfWeek.map(day => (
              <div key={day} className="bg-gray-50 p-3 text-center text-sm font-medium text-gray-700">
                {day}
              </div>
            ))}

            {/* Jours du calendrier */}
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
                  <div className={`text-sm font-medium mb-1 ${
                    isToday ? 'text-blue-600 bg-blue-100 rounded-full w-6 h-6 flex items-center justify-center' : ''
                  }`}>
                    {day.date.getDate()}
                  </div>

                  {/* Événements du jour */}
                  <div className="space-y-1">
                    {day.events.slice(0, 3).map(event => (
                      <div
                        key={event.id}
                        className={`text-xs p-1 rounded text-white truncate ${getEventTypeColor(event.type)}`}
                        title={t('eventTitle', { title: event.title, time: event.time })}
                      >
                        {event.time.split('-')[0]} {event.title}
                      </div>
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

      {/* Liste des événements à venir */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            {t('upcoming')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {events.length === 0 && !isLoading ? (
              <p className="text-sm text-muted-foreground">{t('emptyUpcoming')}</p>
            ) : null}
            {events.slice(0, 5).map(event => (
              <div key={event.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${getEventTypeColor(event.type).split(' ')[0]}`} />
                  <div>
                    <p className="font-medium">{event.title}</p>
                    <p className="text-sm text-gray-500">
                      {new Date(event.date).toLocaleDateString('fr-FR')} • {event.time} • {event.room}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {event.students > 0 && (
                    <Badge variant="secondary">{t('studentsCount', { count: event.students })}</Badge>
                  )}
                  <Button variant="outline" size="sm">
                    {t('details')}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default CalendarPage;
