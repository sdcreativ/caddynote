import { prisma } from './prisma.js';

/**
 * ACA-004/005 : détection de conflits d'emploi du temps et occurrences
 * effectives (créneaux récurrents + exceptions ponctuelles).
 */

export interface ScheduleCandidate {
  institutionId: string;
  dayOfWeek: number;
  startTime: string; // "HH:MM", comparable lexicographiquement
  endTime: string;
  teacherId?: string | null;
  room?: string | null;
  classId?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
}

const timeRangesOverlap = (aStart: string, aEnd: string, bStart: string, bEnd: string): boolean =>
  aStart < bEnd && bStart < aEnd;

/** Conservateur par construction : si l'une des deux bornes est inconnue
 * (créneau sans date de début/fin définie), on considère qu'il y a
 * chevauchement plutôt que de risquer de manquer un vrai conflit. */
const dateRangesOverlap = (
  aStart: Date | null | undefined,
  aEnd: Date | null | undefined,
  bStart: Date | null | undefined,
  bEnd: Date | null | undefined
): boolean => {
  if (!aStart || !aEnd || !bStart || !bEnd) return true;
  return aStart <= bEnd && bStart <= aEnd;
};

export interface ScheduleConflict {
  scheduleId: string;
  courseName: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  reasons: ('teacher' | 'room' | 'class')[];
}

/**
 * Cherche les créneaux actifs de l'établissement qui chevaudraient le
 * candidat (même jour, plage horaire et période qui se recoupent) ET
 * partagent une ressource (même enseignant, même salle, ou même classe) —
 * c'est cette combinaison qui définit un vrai conflit, pas le seul
 * chevauchement horaire (deux classes différentes dans deux salles
 * différentes au même moment ne sont pas en conflit).
 */
export const findScheduleConflicts = async (
  candidate: ScheduleCandidate,
  excludeScheduleId?: string
): Promise<ScheduleConflict[]> => {
  const rows = await prisma.strkSchedule.findMany({
    where: {
      institutionId: candidate.institutionId,
      dayOfWeek: candidate.dayOfWeek,
      isActive: true,
      id: excludeScheduleId ? { not: excludeScheduleId } : undefined,
    },
    include: { course: { select: { name: true } } },
  });

  const conflicts: ScheduleConflict[] = [];
  for (const row of rows) {
    if (!timeRangesOverlap(candidate.startTime, candidate.endTime, row.startTime, row.endTime)) continue;
    if (!dateRangesOverlap(candidate.startDate, candidate.endDate, row.startDate, row.endDate)) continue;

    const reasons: ScheduleConflict['reasons'] = [];
    if (candidate.teacherId && row.teacherId && candidate.teacherId === row.teacherId) reasons.push('teacher');
    if (candidate.room && row.room && candidate.room === row.room) reasons.push('room');
    if (candidate.classId && row.classId && candidate.classId === row.classId) reasons.push('class');
    if (reasons.length === 0) continue;

    conflicts.push({
      scheduleId: row.id,
      courseName: row.course.name,
      dayOfWeek: row.dayOfWeek,
      startTime: row.startTime,
      endTime: row.endTime,
      reasons,
    });
  }
  return conflicts;
};

export interface EffectiveOccurrence {
  date: string; // YYYY-MM-DD
  scheduleId: string;
  courseId: string;
  courseName: string;
  classId: string | null;
  className: string | null;
  room: string | null;
  startTime: string;
  endTime: string;
  status: 'normal' | 'cancelled' | 'substituted';
  teacherId: string | null;
  teacherName: string | null;
  substituteTeacherId?: string;
  substituteTeacherName?: string;
  exceptionReason?: string | null;
}

const toDateKey = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * Résout, jour par jour sur une période, les occurrences réellement
 * applicables d'un emploi du temps récurrent — en appliquant les exceptions
 * ponctuelles (ACA-005) plutôt que d'exposer la seule règle récurrente brute.
 * Filtré par classe et/ou enseignant (au moins un des deux requis, sinon la
 * réponse porterait sur tout l'établissement sans borne utile).
 */
export const computeEffectiveOccurrences = async (params: {
  institutionId: string;
  classId?: string;
  teacherId?: string;
  from: Date;
  to: Date;
}): Promise<EffectiveOccurrence[]> => {
  const schedules = await prisma.strkSchedule.findMany({
    where: {
      institutionId: params.institutionId,
      isActive: true,
      ...(params.classId ? { classId: params.classId } : {}),
      ...(params.teacherId ? { teacherId: params.teacherId } : {}),
    },
    include: {
      course: { select: { id: true, name: true } },
      class: { select: { name: true } },
      teacher: { select: { id: true, firstName: true, lastName: true } },
    },
  });
  if (schedules.length === 0) return [];

  const exceptions = await prisma.strkScheduleException.findMany({
    where: {
      scheduleId: { in: schedules.map((s) => s.id) },
      date: { gte: params.from, lte: params.to },
    },
    include: { substituteTeacher: { select: { id: true, firstName: true, lastName: true } } },
  });
  const exceptionByKey = new Map(exceptions.map((e) => [`${e.scheduleId}|${toDateKey(e.date)}`, e]));

  const occurrences: EffectiveOccurrence[] = [];
  // `from`/`to` sont des dates "calendaires" (YYYY-MM-DD), analysées en UTC
  // par `new Date(...)` — l'itération et le jour de la semaine doivent donc
  // rester en UTC de bout en bout (getUTCDay/setUTCDate), pas en heure
  // locale du serveur : sur un fuseau à décalage négatif, minuit UTC
  // correspond encore à la veille en heure locale, ce qui décalerait le
  // jour de la semaine d'un cran et ferait manquer/dédoubler des occurrences.
  for (let d = new Date(params.from); d <= params.to; d.setUTCDate(d.getUTCDate() + 1)) {
    const current = new Date(d);
    const dayOfWeek = current.getUTCDay();
    const dateKey = toDateKey(current);

    for (const schedule of schedules) {
      if (schedule.dayOfWeek !== dayOfWeek) continue;
      if (schedule.startDate && current < schedule.startDate) continue;
      if (schedule.endDate && current > schedule.endDate) continue;

      const exception = exceptionByKey.get(`${schedule.id}|${dateKey}`);
      const base: EffectiveOccurrence = {
        date: dateKey,
        scheduleId: schedule.id,
        courseId: schedule.course.id,
        courseName: schedule.course.name,
        classId: schedule.classId,
        className: schedule.class?.name ?? null,
        room: schedule.room,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        status: 'normal',
        teacherId: schedule.teacher?.id ?? null,
        teacherName: schedule.teacher ? [schedule.teacher.firstName, schedule.teacher.lastName].filter(Boolean).join(' ') : null,
      };

      if (!exception) {
        occurrences.push(base);
      } else if (exception.type === 'cancelled') {
        occurrences.push({ ...base, status: 'cancelled', exceptionReason: exception.reason });
      } else {
        occurrences.push({
          ...base,
          status: 'substituted',
          exceptionReason: exception.reason,
          substituteTeacherId: exception.substituteTeacherId ?? undefined,
          substituteTeacherName: exception.substituteTeacher
            ? [exception.substituteTeacher.firstName, exception.substituteTeacher.lastName].filter(Boolean).join(' ')
            : undefined,
        });
      }
    }
  }

  return occurrences.sort((a, b) => (a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date)));
};
