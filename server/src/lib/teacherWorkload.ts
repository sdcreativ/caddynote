import { prisma } from './prisma.js';
import { computeEffectiveOccurrences } from './scheduling.js';

/**
 * PER-004 : charge horaire prévue/réalisée. Réutilise le moteur d'occurrences
 * effectives (ACA-005, `lib/scheduling.ts`) plutôt que de réimplémenter une
 * seconde fois la résolution jour par jour d'un emploi du temps récurrent —
 * "prévu" et "réalisé" ne sont que deux lectures différentes des mêmes
 * occurrences (toutes vs. celles qui ont réellement eu lieu).
 *
 * Définitions retenues :
 *  - Prévu : total des créneaux que l'enseignant devait assurer sur la
 *    période, tels que définis par la règle récurrente — indépendamment de
 *    ce qui s'est réellement passé.
 *  - Réalisé : prévu, moins les occurrences annulées et celles où un
 *    remplaçant a repris le créneau (l'enseignant ne l'a pas assuré), plus
 *    les créneaux d'AUTRES enseignants que celui-ci a couverts en tant que
 *    remplaçant (il les a bien assurés, même si ce n'étaient pas les siens).
 */

const parseMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

const durationMinutes = (start: string, end: string): number => Math.max(0, parseMinutes(end) - parseMinutes(start));

export interface TeacherWorkload {
  plannedMinutes: number;
  realizedMinutes: number;
  substituteCoverMinutes: number;
  occurrences: {
    planned: number;
    realized: number;
    cancelled: number;
    substitutedAway: number;
    substituteCovered: number;
  };
}

export const computeTeacherWorkload = async (params: {
  institutionId: string;
  teacherId: string;
  from: Date;
  to: Date;
}): Promise<TeacherWorkload> => {
  const own = await computeEffectiveOccurrences({
    institutionId: params.institutionId,
    teacherId: params.teacherId,
    from: params.from,
    to: params.to,
  });

  let plannedMinutes = 0;
  let realizedMinutes = 0;
  let cancelled = 0;
  let substitutedAway = 0;
  let realizedCount = 0;

  for (const occ of own) {
    const minutes = durationMinutes(occ.startTime, occ.endTime);
    plannedMinutes += minutes;
    if (occ.status === 'normal') {
      realizedMinutes += minutes;
      realizedCount += 1;
    } else if (occ.status === 'cancelled') {
      cancelled += 1;
    } else {
      substitutedAway += 1;
    }
  }

  // Créneaux d'autres enseignants couverts par celui-ci en tant que
  // remplaçant — comptent dans son réalisé, pas dans son prévu (ce n'était
  // pas prévu qu'il les assure).
  const coveredExceptions = await prisma.strkScheduleException.findMany({
    where: {
      institutionId: params.institutionId,
      type: 'substituted',
      substituteTeacherId: params.teacherId,
      date: { gte: params.from, lte: params.to },
    },
    include: { schedule: { select: { startTime: true, endTime: true } } },
  });
  const substituteCoverMinutes = coveredExceptions.reduce(
    (sum, exc) => sum + durationMinutes(exc.schedule.startTime, exc.schedule.endTime),
    0
  );

  return {
    plannedMinutes,
    realizedMinutes: realizedMinutes + substituteCoverMinutes,
    substituteCoverMinutes,
    occurrences: {
      planned: own.length,
      realized: realizedCount,
      cancelled,
      substitutedAway,
      substituteCovered: coveredExceptions.length,
    },
  };
};
