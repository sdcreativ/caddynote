import { apiClient, ApiError } from "@/lib/apiClient";
import { omitEmptyStrings } from "@/lib/omitEmptyStrings";
import { Institution, StrkInstitutionType } from "@/types/strk";

interface ApiInstitution {
  id: string;
  name: string;
  type: StrkInstitutionType;
  address: string | null;
  phone: string | null;
  email: string | null;
  logo: string | null;
  adminId: string | null;
  featureOverrides?: Record<string, boolean> | null;
}

const mapApiInstitution = (i: ApiInstitution): Institution => ({
  id: i.id,
  name: i.name,
  type: i.type,
  address: i.address || '',
  phone: i.phone || '',
  email: i.email || '',
  logo: i.logo || undefined,
  adminId: i.adminId || '',
  featureOverrides: i.featureOverrides ?? null,
});

export const fetchStrkInstitutions = async (): Promise<Institution[]> => {
  try {
    const { institutions } = await apiClient.get<{ institutions: ApiInstitution[] }>('/institutions');
    return institutions.map(mapApiInstitution);
  } catch (error) {
    console.error("Error in fetchStrkInstitutions:", error);
    throw error instanceof ApiError ? error : new Error('Impossible de charger les établissements');
  }
};

export const fetchStrkInstitutionById = async (id: string): Promise<Institution | null> => {
  try {
    const { institution } = await apiClient.get<{ institution: ApiInstitution }>(`/institutions/${id}`);
    return mapApiInstitution(institution);
  } catch (error) {
    console.error("Error in fetchStrkInstitutionById:", error);
    throw error instanceof ApiError ? error : new Error("Impossible de charger l'établissement");
  }
};

export const createStrkInstitution = async (institution: Omit<Institution, "id">): Promise<Institution> => {
  const { institution: created } = await apiClient.post<{ institution: ApiInstitution }>(
    '/institutions',
    omitEmptyStrings({
      name: institution.name,
      type: institution.type,
      address: institution.address,
      phone: institution.phone,
      email: institution.email,
    })
  );
  return mapApiInstitution(created);
};

export const updateStrkInstitution = async (
  id: string,
  institution: Partial<Institution>
): Promise<Institution> => {
  const { institution: updated } = await apiClient.patch<{ institution: ApiInstitution }>(
    `/institutions/${id}`,
    omitEmptyStrings({
      name: institution.name,
      type: institution.type,
      address: institution.address,
      phone: institution.phone,
      email: institution.email,
      adminId: institution.adminId,
    })
  );
  return mapApiInstitution(updated);
};

export const deleteStrkInstitution = async (id: string): Promise<void> => {
  await apiClient.delete(`/institutions/${id}`);
};
