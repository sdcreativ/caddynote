import { apiClient, ApiError, getToken } from '@/lib/apiClient';
import { inferUploadContentType } from '@/lib/s3Upload';

export interface AdmissionInstitution {
  id: string;
  name: string;
  type: string;
}

export interface AdmissionClass {
  id: string;
  name: string;
  academicYear: string | null;
}

export interface AdmissionGuardianInput {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  relationship: 'father' | 'mother' | 'tutor' | 'payer' | 'other_authorized';
}

export interface AdmissionApplication {
  id: string;
  institutionId: string;
  classId: string | null;
  academicYear: string;
  applicationKind?: string;
  level?: string | null;
  profileFlags?: string[];
  status: string;
  studentFirstName: string;
  studentLastName: string;
  studentBirthDate: string;
  studentGender: string | null;
  guardians: AdmissionGuardianInput[];
  documents: { label: string; fileKey: string }[] | null;
  applicationFeeCents: number | null;
  applicationFeeCurrency?: string | null;
  applicationFeePaid: boolean;
  decisionNotes: string | null;
  submittedAt: string | null;
  contactEmail: string;
  publicToken: string;
  createdAt: string;
  previousApplicationId?: string | null;
}

export const fetchAdmissionCampuses = (institutionId: string) =>
  apiClient.get<{ campuses: Array<{ id: string; code: string; name: string; address?: string | null }> }>(
    `/campuses/public/${institutionId}`,
    { skipAuth: true }
  );

export const createAdmissionCampus = (body: { code: string; name: string; address?: string }) =>
  apiClient.post<{ campus: { id: string; code: string; name: string } }>('/campuses', body);

export const fetchAdmissionInstitutions = () =>
  apiClient.get<{ institutions: AdmissionInstitution[] }>('/admissions/institutions', { skipAuth: true });

export const fetchAdmissionClasses = (institutionId: string) =>
  apiClient.get<{ classes: AdmissionClass[] }>(`/admissions/institutions/${institutionId}/classes`, { skipAuth: true });

export const createAdmission = (body: {
  institutionId: string;
  classId?: string;
  academicYear: string;
  applicationKind?: 'pre_registration' | 'first_enrollment' | 're_enrollment' | 'transfer';
  level?: string;
  campus?: string;
  campusId?: string;
  profileFlags?: string[];
  previousApplicationId?: string;
  studentFirstName: string;
  studentLastName: string;
  studentBirthDate: string;
  studentGender: string;
  guardians: AdmissionGuardianInput[];
  contactEmail: string;
}) =>
  apiClient.post<{
    application: AdmissionApplication;
    fileStorageAvailable: boolean;
    storageMode?: 's3' | 'local';
    followEmailSent?: boolean;
    parentAccountLinked?: boolean;
    parentInviteSent?: boolean;
  }>('/admissions', body, { skipAuth: true });

export const recoverAdmissionByEmail = (email: string) =>
  apiClient.post<{
    ok: boolean;
    message: string;
    emailDeliveryAttempted: boolean;
    emailsSent: number;
  }>('/admissions/recover', { email }, { skipAuth: true });

export const fetchAdmissionByToken = (token: string) =>
  apiClient.get<{ application: AdmissionApplication; fileStorageAvailable: boolean }>(
    `/admissions/status/${token}`,
    { skipAuth: true }
  );

export const submitAdmission = (token: string) =>
  apiClient.post<{ application: AdmissionApplication; followEmailSent?: boolean }>(
    `/admissions/status/${token}/submit`,
    {},
    { skipAuth: true }
  );

export interface AdmissionPacketItem {
  id: string;
  status: string;
  fileKey: string | null;
  fileName: string | null;
  obligation: string;
  originalMode?: string;
  rejectionReason: string | null;
  helpText?: string | null;
  reusedFromItemId?: string | null;
  originalSeenAt?: string | null;
  expiresAt?: string | null;
  documentType: {
    id: string;
    code: string;
    label: string;
    category: string;
    allowedMime: string[];
    maxSizeBytes: number;
  };
}

export interface AdmissionPacket {
  template: {
    id: string;
    code: string;
    name: string;
    applicationKind: string;
    level?: string | null;
    academicYear?: string | null;
  } | null;
  completeness: {
    percent: number;
    requiredTotal: number;
    requiredDone: number;
    missingRequired: number;
    canSubmit: boolean;
  };
  storageMode: 's3' | 'local';
  items: AdmissionPacketItem[];
}

export interface AdmissionPacketTemplate {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  applicationKind: string;
  level?: string | null;
  classId?: string | null;
  academicYear?: string | null;
  isDefault: boolean;
  isActive: boolean;
  requirements: Array<{
    id: string;
    documentTypeId: string;
    obligation: string;
    originalMode: string;
    helpText?: string | null;
    conditionRule?: unknown;
    sortOrder: number;
    documentType: { id: string; code: string; label: string; category: string };
  }>;
}

export interface AdmissionDocumentType {
  id: string;
  institutionId: string | null;
  code: string;
  label: string;
  description?: string | null;
  category: string;
  allowedMime: string[];
  maxSizeBytes: number;
  validityDays?: number | null;
  isActive: boolean;
  sortOrder: number;
}

export const fetchAdmissionPacket = (token: string) =>
  apiClient.get<AdmissionPacket>(`/admissions/status/${token}/packet`, { skipAuth: true });

export const fetchAdmissionPacketAdmin = (applicationId: string) =>
  apiClient.get<AdmissionPacket>(`/admissions/${applicationId}/packet`);

export const ensureAdmissionPackets = () =>
  apiClient.post<{ types: AdmissionDocumentType[]; templates: AdmissionPacketTemplate[] }>(
    '/admissions/packets/ensure'
  );

export const fetchAdmissionPacketTemplates = () =>
  apiClient.get<{ templates: AdmissionPacketTemplate[] }>('/admissions/packets/templates');

export const fetchAdmissionPacketCatalog = () =>
  apiClient.get<{ types: AdmissionDocumentType[] }>('/admissions/packets/catalog');

export const createAdmissionPacketTemplate = (body: Record<string, unknown>) =>
  apiClient.post<{ template: AdmissionPacketTemplate }>('/admissions/packets/templates', body);

export const updateAdmissionPacketTemplate = (id: string, body: Record<string, unknown>) =>
  apiClient.patch<{ template: AdmissionPacketTemplate }>(`/admissions/packets/templates/${id}`, body);

export const replaceAdmissionPacketRequirements = (
  id: string,
  requirements: Array<Record<string, unknown>>
) =>
  apiClient.put<{ template: AdmissionPacketTemplate }>(
    `/admissions/packets/templates/${id}/requirements`,
    { requirements }
  );

export const duplicateAdmissionPacketTemplate = (
  id: string,
  body: { code: string; name: string; academicYear?: string }
) =>
  apiClient.post<{ template: AdmissionPacketTemplate }>(
    `/admissions/packets/templates/${id}/duplicate`,
    body
  );

export const createAdmissionDocumentType = (body: Record<string, unknown>) =>
  apiClient.post<{ type: AdmissionDocumentType }>('/admissions/packets/types', body);

export const updateAdmissionDocumentType = (id: string, body: Record<string, unknown>) =>
  apiClient.patch<{ type: AdmissionDocumentType }>(`/admissions/packets/types/${id}`, body);

export const fetchAdmissionReviewQueue = (params: {
  status?: string;
  academicYear?: string;
  level?: string;
  applicationKind?: string;
  pieceStatus?: string;
  submittedFrom?: string;
  submittedTo?: string;
}) => {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) qs.set(k, v);
  }
  return apiClient.get<{
    applications: Array<{
      id: string;
      status: string;
      academicYear: string;
      level: string | null;
      applicationKind: string;
      studentFirstName: string;
      studentLastName: string;
      contactEmail: string;
      submittedAt: string | null;
      class: { id: string; name: string } | null;
      piecesSummary: { total: number; pendingReview: number; nonCompliant: number };
    }>;
  }>(`/admissions/packets/review-queue?${qs.toString()}`);
};

export const reviewAdmissionPacketItem = (
  applicationId: string,
  itemId: string,
  body: { status: string; rejectionReason?: string; reviewNotes?: string; originalSeen?: boolean }
) => apiClient.patch<AdmissionPacket>(`/admissions/${applicationId}/packet/items/${itemId}`, body);

export const reuseAdmissionPacket = (applicationId: string) =>
  apiClient.post<{ reused: number; packet: AdmissionPacket }>(`/admissions/${applicationId}/packet/reuse`, {});

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';

const uploadAdmissionBinary = async (
  key: string,
  uploadPath: string,
  file: File,
  contentType: string
) => {
  const uploaded = await fetch(`${API_BASE}${uploadPath}`, {
    method: 'PUT',
    headers: { 'Content-Type': contentType, 'X-Object-Key': key },
    body: file,
  });
  if (!uploaded.ok) {
    const errBody = await uploaded.json().catch(() => null);
    throw new ApiError(
      (errBody as { error?: string } | null)?.error || 'Échec de l’envoi de la pièce',
      uploaded.status,
      undefined,
      (errBody as { code?: string } | null)?.code
    );
  }
};

const uploadAdmissionViaPresign = async (
  presign: {
    mode?: 's3' | 'local';
    key: string;
    url?: string;
    fields?: Record<string, string>;
    uploadPath?: string;
  },
  file: File,
  contentType: string
) => {
  if (presign.mode === 'local' || (!presign.url && !presign.fields)) {
    if (!presign.uploadPath) throw new ApiError('Réponse d’upload invalide (chemin manquant)', 502);
    await uploadAdmissionBinary(presign.key, presign.uploadPath, file, contentType);
    return;
  }

  if (!presign.url || !presign.fields) {
    throw new ApiError('Réponse d’upload invalide', 502);
  }

  try {
    const form = new FormData();
    for (const [name, value] of Object.entries(presign.fields)) form.append(name, value);
    form.append('file', file);
    const uploaded = await fetch(presign.url, { method: 'POST', body: form });
    if (!uploaded.ok) {
      throw new Error(`S3 upload failed (${uploaded.status})`);
    }
  } catch (err) {
    // CORS / réseau / policy S3 : même clé via l’API (stockage S3 côté serveur).
    if (presign.uploadPath) {
      await uploadAdmissionBinary(presign.key, presign.uploadPath, file, contentType);
      return;
    }
    throw err instanceof ApiError
      ? err
      : new ApiError('Échec de l’envoi de la pièce vers le stockage', 502);
  }
};

export const attachAdmissionPacketItem = async (token: string, itemId: string, file: File) => {
  const contentType = inferUploadContentType(file);
  const presign = await apiClient.post<{
    mode?: 's3' | 'local';
    key: string;
    url?: string;
    fields?: Record<string, string>;
    uploadPath?: string;
  }>(
    `/admissions/status/${token}/packet/items/${itemId}/presign-upload`,
    { filename: file.name, contentType },
    { skipAuth: true }
  );

  await uploadAdmissionViaPresign(presign, file, contentType);

  return apiClient.post<AdmissionPacket>(
    `/admissions/status/${token}/packet/items/${itemId}/attach`,
    { fileKey: presign.key, fileName: file.name, contentType, sizeBytes: file.size },
    { skipAuth: true }
  );
};

/** Supprime le fichier d’une pièce du dossier (statut → missing). */
export const clearAdmissionPacketItem = (token: string, itemId: string) =>
  apiClient.delete<AdmissionPacket>(`/admissions/status/${token}/packet/items/${itemId}/file`, {
    skipAuth: true,
  });

export const attachAdmissionDocument = async (token: string, label: string, file: File) => {
  const contentType = inferUploadContentType(file);
  const presign = await apiClient.post<{
    mode?: 's3' | 'local';
    key: string;
    url?: string;
    fields?: Record<string, string>;
    uploadPath?: string;
    maxSizeBytes?: number;
  }>(
    `/admissions/status/${token}/documents/presign-upload`,
    {
      filename: file.name,
      contentType,
    },
    { skipAuth: true }
  );

  await uploadAdmissionViaPresign(presign, file, contentType);

  return apiClient.post<{ application: AdmissionApplication }>(
    `/admissions/status/${token}/documents`,
    { label, fileKey: presign.key },
    { skipAuth: true }
  );
};

export const fetchAdmissionsQueue = (
  institutionId: string,
  filters?: {
    status?: string;
    academicYear?: string;
    level?: string;
    applicationKind?: string;
    submittedFrom?: string;
    submittedTo?: string;
  }
) => {
  const qs = new URLSearchParams({ institutionId });
  if (filters?.status) qs.set('status', filters.status);
  if (filters?.academicYear) qs.set('academicYear', filters.academicYear);
  if (filters?.level) qs.set('level', filters.level);
  if (filters?.applicationKind) qs.set('applicationKind', filters.applicationKind);
  if (filters?.submittedFrom) qs.set('submittedFrom', filters.submittedFrom);
  if (filters?.submittedTo) qs.set('submittedTo', filters.submittedTo);
  return apiClient.get<{ applications: AdmissionApplication[] }>(`/admissions?${qs.toString()}`);
};

export const updateAdmissionStatus = (id: string, status: string, decisionNotes?: string) =>
  apiClient.patch<{ application: AdmissionApplication }>(`/admissions/${id}/status`, { status, decisionNotes });

export const setAdmissionFee = (id: string, applicationFeeCents: number, applicationFeeCurrency = 'XOF') =>
  apiClient.post<{ application: AdmissionApplication }>(`/admissions/${id}/fee`, {
    applicationFeeCents,
    applicationFeeCurrency,
  });

export const confirmAdmissionFee = (id: string) =>
  apiClient.post<{ application: AdmissionApplication }>(`/admissions/${id}/confirm-fee`, {});

export const enrollAdmission = (id: string) =>
  apiClient.post<{ application: AdmissionApplication; studentId?: string; studentNumber?: string }>(
    `/admissions/${id}/enroll`,
    {}
  );

export const fetchMyAdmissionApplications = () =>
  apiClient.get<{ applications: AdmissionApplication[] }>('/admissions/mine');

export const fetchAdmissionConfirmation = (token: string) =>
  apiClient.get<{
    documentId: string;
    verificationToken: string;
    verificationUrl: string;
    title: string;
  }>(`/admissions/status/${token}/confirmation`, { skipAuth: true });

export const fetchAdmissionPolicy = () =>
  apiClient.get<{
    policy: {
      channels: { email: boolean; sms: boolean; whatsapp: boolean; inApp: boolean };
      payment: {
        trigger: string;
        requirePaidBeforeSubmit: boolean;
        requirePaidBeforeEnroll: boolean;
      };
      expiryReminderDays: number;
      deadlineReminderDays: number;
    };
  }>('/admissions/packets/policy');

export const updateAdmissionPolicy = (body: Record<string, unknown>) =>
  apiClient.put<{ policy: unknown }>('/admissions/packets/policy', body);

export const fetchAdmissionRejectionReasons = () =>
  apiClient.get<{ reasons: Array<{ id: string; code: string; label: string }> }>(
    '/admissions/packets/rejection-reasons'
  );

export const downloadAdmissionPacketItem = async (applicationId: string, itemId: string) => {
  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';
  const token = getToken();
  const res = await fetch(`${API_BASE}/admissions/${applicationId}/packet/items/${itemId}/download`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(body?.error || 'Téléchargement impossible', res.status);
  }
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const body = (await res.json()) as { url?: string; downloadUrl?: string; fileName?: string };
    const signedUrl = body.url || body.downloadUrl;
    if (signedUrl) {
      window.open(signedUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    throw new ApiError('URL de téléchargement absente', 502);
  }
  const blob = await res.blob();
  const disposition = res.headers.get('content-disposition') || '';
  const match = /filename="([^"]+)"/i.exec(disposition);
  const filename = match?.[1] || 'piece';
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

export const fetchAdmissionItemVersions = (applicationId: string, itemId: string) =>
  apiClient.get<{
    versions: Array<{
      id: string;
      version: number;
      status: string;
      fileName: string | null;
      reviewedAt: string | null;
      createdAt: string;
      isCurrent: boolean;
    }>;
  }>(`/admissions/${applicationId}/packet/items/${itemId}/versions`);

export const initiateAdmissionFeeCinetPay = (token: string) =>
  apiClient.post<{ paymentUrl: string; transactionId: string }>(
    `/admissions/status/${token}/pay/cinetpay`,
    {},
    { skipAuth: true }
  );

export const initiateAdmissionFeeStripe = (token: string) =>
  apiClient.post<{ url: string; sessionId: string }>(
    `/admissions/status/${token}/pay/stripe`,
    {},
    { skipAuth: true }
  );
