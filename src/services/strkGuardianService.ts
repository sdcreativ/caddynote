import { apiClient } from "@/lib/apiClient";
import {
  StrkStudentGuardian,
  StrkGuardianRelationship,
  GuardianChildSummary,
} from "@/types/strk";

/**
 * Liste les responsables (parents/tuteurs) déclarés pour un élève donné.
 * Utilisé côté établissement (fiche élève) pour la gestion ELV-002.
 */
export const fetchGuardiansForStudent = async (studentId: string): Promise<StrkStudentGuardian[]> => {
  try {
    const { guardians } = await apiClient.get<{ guardians: any[] }>(`/guardians/for-student/${studentId}`);
    return guardians.map(mapApiGuardian);
  } catch (error) {
    console.error("Error in fetchGuardiansForStudent:", error);
    return [];
  }
};

/**
 * Liste les enfants rattachés à un responsable connecté (espace parent, multi-enfants).
 */
export const fetchChildrenForGuardian = async (guardianId: string): Promise<GuardianChildSummary[]> => {
  try {
    const { children } = await apiClient.get<{ children: GuardianChildSummary[] }>('/guardians/my-children');
    return children;
  } catch (error) {
    console.error("Error in fetchChildrenForGuardian:", error);
    return [];
  }
};

export const findGuardianCandidateByEmail = async (email: string): Promise<{
  id: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  role: string;
} | null> => {
  try {
    const { candidate } = await apiClient.get<{
      candidate: { id: string; firstName: string | null; lastName: string | null; email: string | null; role: string } | null;
    }>(`/guardians/search-by-email?email=${encodeURIComponent(email.trim())}`);
    if (!candidate) return null;
    return {
      id: candidate.id,
      first_name: candidate.firstName || undefined,
      last_name: candidate.lastName || undefined,
      email: candidate.email || undefined,
      role: candidate.role,
    };
  } catch (error) {
    console.error("Error in findGuardianCandidateByEmail:", error);
    return null;
  }
};

export interface LinkGuardianPayload {
  institution_id: string;
  student_id: string;
  guardian_id: string;
  relationship: StrkGuardianRelationship;
  is_primary_contact?: boolean;
  can_view_grades?: boolean;
  can_view_attendance?: boolean;
  can_view_billing?: boolean;
  can_make_payments?: boolean;
  can_receive_communications?: boolean;
  can_authorize_pickup?: boolean;
  can_view_discipline?: boolean;
  can_view_health?: boolean;
  created_by?: string;
}

export const linkGuardianToStudent = async (
  payload: LinkGuardianPayload
): Promise<StrkStudentGuardian | null> => {
  const { guardian } = await apiClient.post<{ guardian: any }>('/guardians', {
    institutionId: payload.institution_id,
    studentId: payload.student_id,
    guardianId: payload.guardian_id,
    relationship: payload.relationship,
    isPrimaryContact: payload.is_primary_contact,
    canViewGrades: payload.can_view_grades,
    canViewAttendance: payload.can_view_attendance,
    canViewBilling: payload.can_view_billing,
    canMakePayments: payload.can_make_payments,
    canReceiveCommunications: payload.can_receive_communications,
    canAuthorizePickup: payload.can_authorize_pickup,
    canViewDiscipline: payload.can_view_discipline,
    canViewHealth: payload.can_view_health,
  });
  return mapApiGuardian(guardian);
};

export type GuardianLinkUpdate = Partial<
  Pick<
    StrkStudentGuardian,
    | "relationship"
    | "is_primary_contact"
    | "can_view_grades"
    | "can_view_attendance"
    | "can_view_billing"
    | "can_make_payments"
    | "can_receive_communications"
    | "can_authorize_pickup"
    | "can_view_discipline"
    | "can_view_health"
    | "status"
  >
>;

export const updateGuardianLink = async (
  id: string,
  updates: GuardianLinkUpdate
): Promise<StrkStudentGuardian | null> => {
  const { guardian } = await apiClient.patch<{ guardian: any }>(`/guardians/${id}`, {
    relationship: updates.relationship,
    isPrimaryContact: updates.is_primary_contact,
    canViewGrades: updates.can_view_grades,
    canViewAttendance: updates.can_view_attendance,
    canViewBilling: updates.can_view_billing,
    canMakePayments: updates.can_make_payments,
    canReceiveCommunications: updates.can_receive_communications,
    canAuthorizePickup: updates.can_authorize_pickup,
    canViewDiscipline: updates.can_view_discipline,
    canViewHealth: updates.can_view_health,
    status: updates.status,
  });
  return mapApiGuardian(guardian);
};

export const deactivateGuardianLink = async (id: string): Promise<boolean> => {
  try {
    await apiClient.patch(`/guardians/${id}/deactivate`);
    return true;
  } catch (error) {
    console.error("Error in deactivateGuardianLink:", error);
    return false;
  }
};

const mapApiGuardian = (g: any): StrkStudentGuardian => ({
  id: g.id,
  institution_id: g.institutionId,
  student_id: g.studentId,
  guardian_id: g.guardianId,
  relationship: g.relationship,
  is_primary_contact: g.isPrimaryContact,
  can_view_grades: g.canViewGrades,
  can_view_attendance: g.canViewAttendance,
  can_view_billing: g.canViewBilling,
  can_make_payments: g.canMakePayments,
  can_receive_communications: g.canReceiveCommunications,
  can_authorize_pickup: g.canAuthorizePickup,
  can_view_discipline: g.canViewDiscipline ?? true,
  can_view_health: g.canViewHealth ?? true,
  status: g.status,
  created_by: g.createdBy || undefined,
  created_at: g.createdAt,
  updated_at: g.updatedAt,
  guardian: g.guardian
    ? {
        id: g.guardian.id,
        first_name: g.guardian.firstName,
        last_name: g.guardian.lastName,
        email: g.guardian.email,
        phone_number: g.guardian.phoneNumber,
      }
    : undefined,
  student: g.student
    ? { id: g.student.id, first_name: g.student.firstName, last_name: g.student.lastName, email: g.student.email }
    : undefined,
});
