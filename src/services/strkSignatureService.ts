import { apiClient, ApiError } from "@/lib/apiClient";
import { sendCommunication } from "@/services/strkCommunicationService";
import { StrkSignature, StrkSignatureType, StrkSignatureStatus } from "@/types/strk";

interface ApiSignature {
  id: string;
  studentId: string;
  institutionId: string;
  title: string;
  type: StrkSignatureType;
  status: StrkSignatureStatus;
  date: string;
  timestamp?: string | null;
  signatureData?: string | null;
  verified?: boolean | null;
  senderId?: string | null;
  recipientId?: string | null;
  expiresAt?: string | null;
  completedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  student?: { profile?: { firstName: string | null; lastName: string | null; email: string | null } | null } | null;
  sender?: { firstName: string | null; lastName: string | null; email: string | null } | null;
  recipient?: { firstName: string | null; lastName: string | null; email: string | null } | null;
}

const mapApiSignature = (s: ApiSignature): StrkSignature & Record<string, unknown> => ({
  id: s.id,
  student_id: s.studentId,
  institution_id: s.institutionId,
  title: s.title,
  type: s.type,
  status: s.status,
  date: s.date,
  timestamp: s.timestamp || undefined,
  signature_data: s.signatureData || undefined,
  verified: s.verified ?? false,
  sender_id: s.senderId || undefined,
  recipient_id: s.recipientId || undefined,
  expires_at: s.expiresAt || undefined,
  completed_at: s.completedAt || undefined,
  created_at: s.createdAt || '',
  updated_at: s.updatedAt || '',
  student: s.student?.profile
    ? { first_name: s.student.profile.firstName, last_name: s.student.profile.lastName, email: s.student.profile.email }
    : undefined,
  sender: s.sender ? { first_name: s.sender.firstName, last_name: s.sender.lastName, email: s.sender.email } : undefined,
  recipient: s.recipient
    ? { first_name: s.recipient.firstName, last_name: s.recipient.lastName, email: s.recipient.email }
    : undefined,
});

export const createStrkSignature = async (signatureData: {
  student_id: string;
  institution_id: string;
  title: string;
  type: StrkSignatureType;
  date: string;
  timestamp?: string;
  sender_id?: string;
  recipient_id?: string;
  expires_at?: string;
}): Promise<StrkSignature | null> => {
  try {
    const { signature } = await apiClient.post<{ signature: ApiSignature }>('/signatures', {
      studentId: signatureData.student_id,
      institutionId: signatureData.institution_id,
      title: signatureData.title,
      type: signatureData.type,
      date: signatureData.date,
      timestamp: signatureData.timestamp,
      senderId: signatureData.sender_id,
      recipientId: signatureData.recipient_id,
      expiresAt: signatureData.expires_at,
    });
    return mapApiSignature(signature);
  } catch (error) {
    console.error("Error in createStrkSignature:", error);
    return null;
  }
};

export const fetchStrkSignaturesByInstitution = async (institutionId: string): Promise<StrkSignature[]> => {
  try {
    const { signatures } = await apiClient.get<{ signatures: ApiSignature[] }>(
      `/signatures?institutionId=${encodeURIComponent(institutionId)}`
    );
    return signatures.map(mapApiSignature);
  } catch (error) {
    console.error("Error in fetchStrkSignaturesByInstitution:", error);
    return [];
  }
};

export const fetchStrkSignaturesByStudent = async (studentId: string): Promise<StrkSignature[]> => {
  try {
    const { signatures } = await apiClient.get<{ signatures: ApiSignature[] }>(
      `/signatures?studentId=${encodeURIComponent(studentId)}`
    );
    return signatures.map(mapApiSignature);
  } catch (error) {
    console.error("Error in fetchStrkSignaturesByStudent:", error);
    return [];
  }
};

export const updateStrkSignatureStatus = async (
  signatureId: string,
  status: StrkSignatureStatus,
  signatureData?: string
): Promise<StrkSignature | null> => {
  try {
    const { signature } = await apiClient.patch<{ signature: ApiSignature }>(`/signatures/${signatureId}/status`, {
      status,
      signatureData,
    });
    return mapApiSignature(signature);
  } catch (error) {
    console.error("Error in updateStrkSignatureStatus:", error);
    return null;
  }
};

export const deleteStrkSignature = async (signatureId: string): Promise<boolean> => {
  try {
    await apiClient.delete(`/signatures/${signatureId}`);
    return true;
  } catch (error) {
    console.error("Error in deleteStrkSignature:", error);
    return false;
  }
};

export const fetchStrkSignatureById = async (signatureId: string): Promise<StrkSignature | null> => {
  try {
    const { signature } = await apiClient.get<{ signature: ApiSignature }>(`/signatures/${signatureId}`);
    return mapApiSignature(signature);
  } catch (error) {
    console.error("Error in fetchStrkSignatureById:", error);
    return null;
  }
};

/** Relance e-mail réelle via POST /communications/send. `not_configured` si SMTP absent (501). */
export const notifySignatureRequest = async (
  studentId: string,
  title: string,
  body?: string
): Promise<'sent' | 'not_configured'> => {
  try {
    await sendCommunication({
      recipientId: studentId,
      channel: 'email',
      useCase: 'signature_request',
      subject: `Demande de signature : ${title}`,
      body:
        body ||
        `Une demande de signature vous attend dans CaddyNote : « ${title} ». Connectez-vous à l’espace Signatures pour la signer.`,
    });
    return 'sent';
  } catch (error) {
    if (error instanceof ApiError && error.status === 501) {
      return 'not_configured';
    }
    throw error;
  }
};
