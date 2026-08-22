import { apiClient } from "@/lib/apiClient";

export interface StrkGradingScale {
  id: string;
  institution_id: string;
  name: string;
  max_value: number;
  is_default: boolean;
}

interface ApiGradingScale {
  id: string;
  institutionId: string;
  name: string;
  maxValue: number;
  isDefault: boolean;
}

const mapApiScale = (s: ApiGradingScale): StrkGradingScale => ({
  id: s.id,
  institution_id: s.institutionId,
  name: s.name,
  max_value: Number(s.maxValue),
  is_default: s.isDefault,
});

/** EVA-002 : barèmes nommés et réutilisables (ex. « Note sur 20 »),
 * configurés une fois par établissement plutôt que ressaisis en texte
 * libre à chaque note. */
export const fetchGradingScales = async (institutionId: string): Promise<StrkGradingScale[]> => {
  try {
    const { scales } = await apiClient.get<{ scales: ApiGradingScale[] }>(
      `/grading-scales?institutionId=${encodeURIComponent(institutionId)}`
    );
    return scales.map(mapApiScale);
  } catch (error) {
    console.error("Error in fetchGradingScales:", error);
    return [];
  }
};

export const createGradingScale = async (data: {
  institution_id: string;
  name: string;
  max_value: number;
  is_default?: boolean;
}): Promise<StrkGradingScale | null> => {
  try {
    const { scale } = await apiClient.post<{ scale: ApiGradingScale }>('/grading-scales', {
      institutionId: data.institution_id,
      name: data.name,
      maxValue: data.max_value,
      isDefault: data.is_default,
    });
    return mapApiScale(scale);
  } catch (error) {
    console.error("Error in createGradingScale:", error);
    return null;
  }
};

export const deleteGradingScale = async (id: string): Promise<boolean> => {
  try {
    await apiClient.delete(`/grading-scales/${id}`);
    return true;
  } catch (error) {
    console.error("Error in deleteGradingScale:", error);
    return false;
  }
};
