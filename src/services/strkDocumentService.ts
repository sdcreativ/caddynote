import { apiClient, getToken } from '@/lib/apiClient';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

/**
 * DOC-001 à 005 — le module Documents (certificat, reçu, bulletin, relevé,
 * liste de classe, personnalisation, révocation) était entièrement
 * construit et testé côté serveur sans aucune interface, contrairement à
 * ce qui a été fait pour Finance juste avant. Ce service relie enfin
 * l'écran à l'API existante.
 */

export type StrkDocumentType =
  | 'enrollment_certificate'
  | 'payment_receipt'
  | 'report_card'
  | 'transcript'
  | 'class_list'
  | 'student_card'
  | 'school_attestation'
  | 'invoice';

export const DOCUMENT_TYPE_LABELS: Record<StrkDocumentType, string> = {
  enrollment_certificate: 'Certificat de scolarité',
  payment_receipt: 'Reçu de paiement',
  report_card: 'Bulletin',
  transcript: 'Relevé de notes',
  class_list: 'Liste de classe',
  student_card: 'Carte d’élève',
  school_attestation: 'Attestation de scolarité',
  invoice: 'Facture PDF',
};

export interface StrkDocument {
  id: string;
  institution_id: string;
  type: StrkDocumentType;
  subject_id: string;
  version: number;
  status: 'generated' | 'revoked';
  title: string;
  generated_at: string;
  revoked_at?: string;
}

interface ApiDocument {
  id: string;
  institutionId: string;
  type: StrkDocumentType;
  subjectId: string;
  version: number;
  status: 'generated' | 'revoked';
  title: string;
  generatedAt: string;
  revokedAt?: string | null;
}

const mapDocument = (d: ApiDocument): StrkDocument => ({
  id: d.id,
  institution_id: d.institutionId,
  type: d.type,
  subject_id: d.subjectId,
  version: d.version,
  status: d.status,
  title: d.title,
  generated_at: d.generatedAt,
  revoked_at: d.revokedAt || undefined,
});

export const fetchDocuments = async (institutionId: string): Promise<StrkDocument[]> => {
  try {
    const { documents } = await apiClient.get<{ documents: ApiDocument[] }>(
      `/documents?institutionId=${encodeURIComponent(institutionId)}`
    );
    return documents.map(mapDocument);
  } catch (error) {
    console.error('Error in fetchDocuments:', error);
    return [];
  }
};

export const generateEnrollmentCertificate = async (studentId: string): Promise<StrkDocument | null> => {
  try {
    const { document } = await apiClient.post<{ document: ApiDocument }>('/documents/enrollment-certificate', { studentId });
    return mapDocument(document);
  } catch (error) {
    console.error('Error in generateEnrollmentCertificate:', error);
    return null;
  }
};

export const generateReportCard = async (studentId: string, periodId: string): Promise<StrkDocument | null> => {
  try {
    const { document } = await apiClient.post<{ document: ApiDocument }>('/documents/report-card', { studentId, periodId });
    return mapDocument(document);
  } catch (error) {
    console.error('Error in generateReportCard:', error);
    return null;
  }
};

export const generateTranscript = async (studentId: string, academicYear: string): Promise<StrkDocument | null> => {
  try {
    const { document } = await apiClient.post<{ document: ApiDocument }>('/documents/transcript', { studentId, academicYear });
    return mapDocument(document);
  } catch (error) {
    console.error('Error in generateTranscript:', error);
    return null;
  }
};

export const generateClassList = async (classId: string): Promise<StrkDocument | null> => {
  try {
    const { document } = await apiClient.post<{ document: ApiDocument }>('/documents/class-list', { classId });
    return mapDocument(document);
  } catch (error) {
    console.error('Error in generateClassList:', error);
    return null;
  }
};

export const generateStudentCard = async (studentId: string): Promise<StrkDocument | null> => {
  try {
    const { document } = await apiClient.post<{ document: ApiDocument }>('/documents/student-card', { studentId });
    return mapDocument(document);
  } catch (error) {
    console.error('Error in generateStudentCard:', error);
    return null;
  }
};

export const generateSchoolAttestation = async (studentId: string, purpose?: string): Promise<StrkDocument | null> => {
  try {
    const { document } = await apiClient.post<{ document: ApiDocument }>('/documents/school-attestation', {
      studentId,
      purpose,
    });
    return mapDocument(document);
  } catch (error) {
    console.error('Error in generateSchoolAttestation:', error);
    return null;
  }
};

export const generateInvoiceDocument = async (invoiceId: string): Promise<StrkDocument | null> => {
  try {
    const { document } = await apiClient.post<{ document: ApiDocument }>('/documents/invoice', { invoiceId });
    return mapDocument(document);
  } catch (error) {
    console.error('Error in generateInvoiceDocument:', error);
    return null;
  }
};

export const generatePaymentReceipt = async (paymentId: string): Promise<StrkDocument | null> => {
  try {
    const { document } = await apiClient.post<{ document: ApiDocument }>('/documents/payment-receipt', { paymentId });
    return mapDocument(document);
  } catch (error) {
    console.error('Error in generatePaymentReceipt:', error);
    return null;
  }
};

export const revokeDocument = async (id: string): Promise<boolean> => {
  try {
    await apiClient.post(`/documents/${id}/revoke`, {});
    return true;
  } catch (error) {
    console.error('Error in revokeDocument:', error);
    return false;
  }
};

/**
 * DOC-005 : selon la configuration serveur, `/download` renvoie soit une URL
 * signée S3 (JSON, à ouvrir directement), soit le PDF lui-même (régénéré à
 * la volée si S3 n'est pas configuré — le cas dans cet environnement). Hors
 * de `apiClient` volontairement, comme `downloadReportExport` : celui-ci ne
 * sait parser que du JSON, pas un flux binaire.
 */
export const downloadDocument = async (id: string, filename: string): Promise<void> => {
  const token = getToken();
  const response = await fetch(`${API_BASE_URL}/documents/${id}/download`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || `Erreur ${response.status} lors du téléchargement`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const { downloadUrl } = await response.json();
    window.open(downloadUrl, '_blank');
    return;
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};
