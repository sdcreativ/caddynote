import type { StrkAttendance } from '@/services/strkAttendanceService';

/** Une séance d’appel (matière × date × horaire × enseignant). */
export type AttendanceSessionGroup = {
  key: string;
  date: string;
  courseId?: string;
  courseName?: string;
  className?: string;
  startTime?: string;
  endTime?: string;
  /** Prof du cours / créneau, ou auteur de l’appel. */
  teacherName?: string;
  records: StrkAttendance[];
  absentCount: number;
  lateCount: number;
};

const toDateKey = (raw: string): string => {
  const d = raw.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : raw;
};

const sessionTeacher = (r: StrkAttendance): string | undefined =>
  r.recorded_by_name || r.teacher_name || undefined;

/**
 * Regroupe les absences/retards par séance d’appel.
 * Clé : date + cours + horaire + auteur (évite de mélanger deux appels le même jour).
 */
export const groupAttendanceBySession = (records: StrkAttendance[]): AttendanceSessionGroup[] => {
  const map = new Map<string, AttendanceSessionGroup>();

  for (const record of records) {
    const date = toDateKey(record.date);
    const key = [
      date,
      record.course_id || 'none',
      record.start_time || '',
      record.created_by || sessionTeacher(record) || '',
    ].join('|');

    let group = map.get(key);
    if (!group) {
      group = {
        key,
        date,
        courseId: record.course_id,
        courseName: record.course_name,
        className: record.class_name,
        startTime: record.start_time,
        endTime: record.end_time,
        teacherName: sessionTeacher(record),
        records: [],
        absentCount: 0,
        lateCount: 0,
      };
      map.set(key, group);
    }
    group.records.push(record);
    if (record.type === 'absence') group.absentCount += 1;
    if (record.type === 'lateness') group.lateCount += 1;
    if (!group.courseName && record.course_name) group.courseName = record.course_name;
    if (!group.className && record.class_name) group.className = record.class_name;
    if (!group.startTime && record.start_time) group.startTime = record.start_time;
    if (!group.endTime && record.end_time) group.endTime = record.end_time;
    if (!group.teacherName) group.teacherName = sessionTeacher(record);
  }

  for (const group of map.values()) {
    group.records.sort((a, b) =>
      (a.student_name || a.student_id).localeCompare(b.student_name || b.student_id, 'fr')
    );
  }

  return [...map.values()].sort((a, b) => {
    const dateCmp = b.date.localeCompare(a.date);
    if (dateCmp !== 0) return dateCmp;
    const timeA = a.startTime || '';
    const timeB = b.startTime || '';
    if (timeA !== timeB) return timeB.localeCompare(timeA);
    return (a.courseName || '').localeCompare(b.courseName || '', 'fr');
  });
};

export const formatSessionDateLabel = (dateKey: string): string => {
  const d = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateKey;
  return d.toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

export const formatSessionTimeRange = (start?: string, end?: string): string | undefined => {
  if (start && end) return `${start}–${end}`;
  if (start) return start;
  return undefined;
};

export const formatSessionHeading = (group: AttendanceSessionGroup): string => {
  const parts = [
    group.courseName || 'Cours',
    group.className,
    formatSessionDateLabel(group.date),
    formatSessionTimeRange(group.startTime, group.endTime),
    group.teacherName ? `Prof. ${group.teacherName}` : undefined,
  ].filter(Boolean);
  return parts.join(' · ');
};

export type AttendanceHistoryPeriod = 'today' | '7d' | '30d' | 'all';

/** Filtre les enregistrements sur une période relative à `now` (date locale YYYY-MM-DD). */
export const filterAttendanceByPeriod = (
  records: StrkAttendance[],
  period: AttendanceHistoryPeriod,
  now: Date = new Date()
): StrkAttendance[] => {
  if (period === 'all') return records;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = period === 'today' ? 0 : period === '7d' ? 7 : 30;
  const from = new Date(today);
  from.setDate(from.getDate() - days);
  const fromKey = [
    from.getFullYear(),
    String(from.getMonth() + 1).padStart(2, '0'),
    String(from.getDate()).padStart(2, '0'),
  ].join('-');
  const toKey = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-');

  return records.filter((r) => {
    const d = r.date.slice(0, 10);
    return d >= fromKey && d <= toKey;
  });
};
