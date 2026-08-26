import { normalizeTimeHhMm, parseScheduleDayToDayOfWeek } from './courseSchedule.js';

export type UpcomingCallCandidate = {
  courseId: string;
  classId: string | null;
  courseName: string;
  className: string | null;
  startTime: string;
  scheduleId: string | null;
};

export type UpcomingAttendanceCall = UpcomingCallCandidate & {
  minutesUntilStart: number;
};

/** "HH:MM" → minutes depuis minuit. */
export const hhMmToMinutes = (hhMm: string): number | null => {
  const normalized = normalizeTimeHhMm(hhMm);
  if (!normalized) return null;
  const [h, m] = normalized.split(':').map(Number);
  return h * 60 + m;
};

/**
 * Vrai si `now` est dans la fenêtre ]0, withinMinutes] avant le début du créneau
 * le même jour de la semaine (0=dim … 6=sam).
 */
export const minutesUntilSlotStart = (
  now: Date,
  dayOfWeek: number,
  startTime: string
): number | null => {
  if (now.getDay() !== dayOfWeek) return null;
  const startMin = hhMmToMinutes(startTime);
  if (startMin == null) return null;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  return startMin - nowMin;
};

export const isWithinLeadWindow = (
  now: Date,
  dayOfWeek: number,
  startTime: string,
  withinMinutes: number
): boolean => {
  const delta = minutesUntilSlotStart(now, dayOfWeek, startTime);
  if (delta == null) return false;
  return delta > 0 && delta <= withinMinutes;
};

export const filterUpcomingCalls = (
  candidates: Array<UpcomingCallCandidate & { dayOfWeek: number }>,
  now: Date,
  withinMinutes: number,
  alreadyTakenCourseIds: Set<string>
): UpcomingAttendanceCall[] => {
  const out: UpcomingAttendanceCall[] = [];
  for (const c of candidates) {
    if (alreadyTakenCourseIds.has(c.courseId)) continue;
    const delta = minutesUntilSlotStart(now, c.dayOfWeek, c.startTime);
    if (delta == null || delta <= 0 || delta > withinMinutes) continue;
    out.push({
      courseId: c.courseId,
      classId: c.classId,
      courseName: c.courseName,
      className: c.className,
      startTime: normalizeTimeHhMm(c.startTime) ?? c.startTime,
      scheduleId: c.scheduleId,
      minutesUntilStart: delta,
    });
  }
  out.sort((a, b) => a.minutesUntilStart - b.minutesUntilStart);
  return out;
};

export { parseScheduleDayToDayOfWeek };
