import type { StrkAbsence } from '@/services/strkAbsenceService';

export type PresenceTodayKind = 'present' | 'absent' | 'late';

export type PresenceToday = {
  kind: PresenceTodayKind;
  /** Heure affichable (ex. 08:05) si connue. */
  timeLabel?: string;
};

const localDateKey = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const absenceDateKey = (raw: string): string => {
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return trimmed.slice(0, 10);
  return localDateKey(parsed);
};

const formatTimeLabel = (isoOrTime?: string | null): string | undefined => {
  if (!isoOrTime) return undefined;
  const t = isoOrTime.trim();
  if (/^\d{2}:\d{2}/.test(t)) return t.slice(0, 5);
  const parsed = new Date(t);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
};

/**
 * Statut du jour pour un élève : présence si aucune absence/retard aujourd’hui.
 * (Les appels ne stockent en base que les anomalies.)
 */
export const presenceTodayFromAbsences = (
  absences: Pick<StrkAbsence, 'type' | 'date' | 'start_time' | 'created_at'>[],
  now: Date = new Date()
): PresenceToday => {
  const today = localDateKey(now);
  const todayRows = absences.filter((a) => absenceDateKey(a.date) === today);
  if (todayRows.length === 0) {
    return { kind: 'present' };
  }
  const absent = todayRows.find((a) => a.type === 'absence');
  if (absent) {
    return {
      kind: 'absent',
      timeLabel: formatTimeLabel(absent.start_time) ?? formatTimeLabel(absent.created_at),
    };
  }
  const late = todayRows.find((a) => a.type === 'lateness') ?? todayRows[0];
  return {
    kind: 'late',
    timeLabel: formatTimeLabel(late.start_time) ?? formatTimeLabel(late.created_at),
  };
};
