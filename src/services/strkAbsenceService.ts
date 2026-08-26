import { apiClient } from "@/lib/apiClient";

// PRS-005 : statut du justificatif, distinct de `justified` — `justified`
// seul ne distingue pas "jamais soumis" de "rejeté" (les deux valent
// `false`). Sert à faire apparaître une vraie file d'attente de validation
// côté personnel (statut `pending`).
export type StrkJustificationStatus = 'none' | 'pending' | 'accepted' | 'rejected';

export interface StrkAbsence {
  id: string;
  student_id: string;
  institution_id: string;
  type: 'absence' | 'lateness';
  date: string;
  duration: number;
  justified: boolean;
  justification_status: StrkJustificationStatus;
  justification?: string;
  justification_file?: string;
  reason?: string;
  course_id?: string;
  created_at: string;
  updated_at: string;
  student?: {
    first_name: string;
    last_name: string;
    email: string;
  };
  duration_minutes: number;
  justification_reason?: string;
  /** Nom du cours (jamais un UUID). */
  course_name?: string;
  /** Nom de la classe rattachée au cours. */
  class_name?: string;
  start_time?: string;
  end_time?: string;
}

interface ApiAbsence {
  id: string;
  studentId: string;
  institutionId: string;
  type: 'absence' | 'lateness';
  date: string;
  duration: number;
  justified: boolean | null;
  justificationStatus: StrkJustificationStatus;
  justification?: string | null;
  justificationFile?: string | null;
  reason?: string | null;
  courseId?: string | null;
  createdAt: string;
  updatedAt: string;
  student?: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
  } | null;
  courseName?: string | null;
  className?: string | null;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Libellé affichable : ignore vide / UUID (ancien bug courseId → class_name). */
export const cleanAbsenceLabel = (value?: string | null): string | undefined => {
  const trimmed = value?.trim();
  if (!trimmed || UUID_RE.test(trimmed)) return undefined;
  return trimmed;
};

/** Libellé « Cours » pour l’UI parent / listes. */
export const formatAbsenceCourseLabel = (absence: Pick<StrkAbsence, 'course_name' | 'class_name'>): string | undefined => {
  return absence.course_name || absence.class_name || undefined;
};

export const mapApiAbsence = (a: ApiAbsence): StrkAbsence => {
  const firstName = a.student?.firstName?.trim() || '';
  const lastName = a.student?.lastName?.trim() || '';
  const courseName = cleanAbsenceLabel(a.courseName);
  const className = cleanAbsenceLabel(a.className);
  return {
    id: a.id,
    student_id: a.studentId,
    institution_id: a.institutionId,
    type: a.type,
    date: a.date,
    duration: a.duration,
    justified: !!a.justified,
    justification_status: a.justificationStatus ?? 'none',
    justification: a.justification || undefined,
    justification_file: a.justificationFile || undefined,
    reason: a.reason || undefined,
    course_id: a.courseId || undefined,
    created_at: a.createdAt,
    updated_at: a.updatedAt,
    duration_minutes: a.duration,
    justification_reason: a.justification || undefined,
    course_name: courseName,
    class_name: className,
    student:
      firstName || lastName || a.student?.email
        ? {
            first_name: firstName,
            last_name: lastName,
            email: a.student?.email || '',
          }
        : undefined,
  };
};

export const fetchAbsencesByInstitution = async (institutionId: string): Promise<StrkAbsence[]> => {
  try {
    const { absences } = await apiClient.get<{ absences: ApiAbsence[] }>(
      `/absences?institutionId=${encodeURIComponent(institutionId)}`
    );
    return absences.map(mapApiAbsence);
  } catch (error) {
    console.error("Error in fetchAbsencesByInstitution:", error);
    return [];
  }
};

export const fetchAbsencesByStudent = async (studentId: string): Promise<StrkAbsence[]> => {
  try {
    const { absences } = await apiClient.get<{ absences: ApiAbsence[] }>(
      `/absences?studentId=${encodeURIComponent(studentId)}`
    );
    return absences.map(mapApiAbsence);
  } catch (error) {
    console.error("Error in fetchAbsencesByStudent:", error);
    return [];
  }
};

export const createStrkAbsence = async (absenceData: {
  student_id: string;
  institution_id: string;
  type: 'absence' | 'lateness';
  date: string;
  duration_minutes: number;
  class_name?: string;
}): Promise<StrkAbsence | null> => {
  try {
    const { absence } = await apiClient.post<{ absence: ApiAbsence }>('/absences', {
      studentId: absenceData.student_id,
      institutionId: absenceData.institution_id,
      type: absenceData.type,
      date: absenceData.date,
      duration: absenceData.duration_minutes,
    });
    return mapApiAbsence(absence);
  } catch (error) {
    console.error("Error in createStrkAbsence:", error);
    return null;
  }
};

export const justifyAbsence = async (
  absenceId: string,
  justificationReason: string,
  justificationFile?: string
): Promise<StrkAbsence | null> => {
  try {
    const { absence } = await apiClient.patch<{ absence: ApiAbsence }>(`/absences/${absenceId}/justify`, {
      justification: justificationReason,
      justificationFile,
    });
    return mapApiAbsence(absence);
  } catch (error) {
    console.error("Error in justifyAbsence:", error);
    return null;
  }
};

/**
 * PRS-005 : décision du personnel (accepter/rejeter) sur un justificatif
 * déposé — ou justification directe d'une absence sans dépôt préalable
 * (ex. certificat médical remis en main propre).
 */
export const reviewAbsenceJustification = async (
  absenceId: string,
  justified: boolean
): Promise<StrkAbsence | null> => {
  try {
    const { absence } = await apiClient.patch<{ absence: ApiAbsence }>(`/absences/${absenceId}/review`, {
      justified,
    });
    return mapApiAbsence(absence);
  } catch (error) {
    console.error("Error in reviewAbsenceJustification:", error);
    return null;
  }
};
