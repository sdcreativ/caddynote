/**
 * Dérive un créneau d’emploi du temps (`StrkSchedule`) depuis les champs
 * optionnels saisis à la création d’un cours (jour + heure + durée).
 * dayOfWeek : convention JS (0 = dimanche … 6 = samedi), alignée sur
 * `StrkSchedule.dayOfWeek` et le calendrier front.
 */

const DAY_NAME_TO_DOW: Record<string, number> = {
  dimanche: 0,
  sunday: 0,
  lundi: 1,
  monday: 1,
  mardi: 2,
  tuesday: 2,
  mercredi: 3,
  wednesday: 3,
  jeudi: 4,
  thursday: 4,
  vendredi: 5,
  friday: 5,
  samedi: 6,
  saturday: 6,
};

export const parseScheduleDayToDayOfWeek = (scheduleDay: string): number | null => {
  const trimmed = scheduleDay.trim();
  if (/^[0-6]$/.test(trimmed)) return Number(trimmed);
  const key = trimmed
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
  return DAY_NAME_TO_DOW[key] ?? null;
};

/** Normalise "HH:MM" ou "HH:MM:SS" → "HH:MM". */
export const normalizeTimeHhMm = (raw: string): string | null => {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(raw.trim());
  if (!m) return null;
  return `${m[1].padStart(2, '0')}:${m[2]}`;
};

export const addMinutesToHhMm = (startHhMm: string, minutes: number): string | null => {
  const start = normalizeTimeHhMm(startHhMm);
  if (!start || !Number.isFinite(minutes) || minutes <= 0) return null;
  const [h, m] = start.split(':').map(Number);
  const total = h * 60 + m + Math.floor(minutes);
  if (total >= 24 * 60) return null; // créneau qui dépasse minuit : non supporté
  const endH = Math.floor(total / 60);
  const endM = total % 60;
  return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
};

export type CourseScheduleInput = {
  scheduleDay?: string | null;
  scheduleTime?: string | null;
  duration?: number | null;
};

export type DerivedCourseSchedule = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
};

/**
 * Retourne null si jour/heure absents (cours sans créneau calendrier).
 * Lève une Error avec message métier si les valeurs sont présentes mais invalides.
 */
export const deriveScheduleFromCourseFields = (
  input: CourseScheduleInput
): DerivedCourseSchedule | null => {
  const dayRaw = input.scheduleDay?.trim() || '';
  const timeRaw = input.scheduleTime?.trim() || '';
  if (!dayRaw && !timeRaw) return null;
  if (!dayRaw || !timeRaw) {
    throw new Error('Indiquez le jour et l’heure pour publier le cours au calendrier');
  }
  const dayOfWeek = parseScheduleDayToDayOfWeek(dayRaw);
  if (dayOfWeek == null) {
    throw new Error('Jour de la semaine invalide');
  }
  const startTime = normalizeTimeHhMm(timeRaw);
  if (!startTime) {
    throw new Error('Heure de début invalide (attendu HH:MM)');
  }
  const duration = input.duration && input.duration > 0 ? input.duration : 60;
  const endTime = addMinutesToHhMm(startTime, duration);
  if (!endTime) {
    throw new Error('La durée dépasse minuit ; choisissez une plage plus courte');
  }
  return { dayOfWeek, startTime, endTime };
};
