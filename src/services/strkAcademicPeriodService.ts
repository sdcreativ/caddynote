import { apiClient } from "@/lib/apiClient";

export interface StrkAcademicPeriod {
  id: string;
  institution_id: string;
  academic_year: string;
  name: string;
  order: number;
  start_date: string;
  end_date: string;
  is_active: boolean;
}

interface ApiAcademicPeriod {
  id: string;
  institutionId: string;
  academicYear: string;
  name: string;
  order: number;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

const mapApiPeriod = (p: ApiAcademicPeriod): StrkAcademicPeriod => ({
  id: p.id,
  institution_id: p.institutionId,
  academic_year: p.academicYear,
  name: p.name,
  order: p.order,
  start_date: p.startDate,
  end_date: p.endDate,
  is_active: p.isActive,
});

/** EVA-004 : périodes académiques d'un établissement (trimestres/semestres),
 * nécessaires pour la saisie de notes (period_id requis côté serveur). */
export const fetchAcademicPeriods = async (institutionId: string): Promise<StrkAcademicPeriod[]> => {
  try {
    const { periods } = await apiClient.get<{ periods: ApiAcademicPeriod[] }>(
      `/academic-periods?institutionId=${encodeURIComponent(institutionId)}`
    );
    return periods.map(mapApiPeriod);
  } catch (error) {
    console.error("Error in fetchAcademicPeriods:", error);
    return [];
  }
};
