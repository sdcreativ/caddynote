import { sendEmail, isEmailConfigured } from './email.js';
import { sendSms, sendWhatsApp, isSmsConfigured, isWhatsAppConfigured } from './sms.js';

/**
 * Notifications admissions multi-canal (e-mail + SMS/WhatsApp si configurés).
 * Spec §12 — destinataire = contact du dossier (pas encore de profil parent).
 */

const appBaseUrl = (): string =>
  (process.env.APP_URL || process.env.FRONTEND_URL || 'http://localhost:8080').replace(/\/$/, '');

export const admissionFollowUrl = (publicToken: string): string =>
  `${appBaseUrl()}/admissions/suivi/${publicToken}`;

export type AdmissionFollowEmailKind = 'created' | 'submitted' | 'recover';

export type AdmissionNoticeKind =
  | AdmissionFollowEmailKind
  | 'needs_info'
  | 'accepted'
  | 'rejected'
  | 'enrolled'
  | 'piece_rejected'
  | 'piece_unreadable'
  | 'original_requested'
  | 'piece_expired'
  | 'payment_due'
  | 'payment_received';

const SUBJECTS: Record<AdmissionNoticeKind, string> = {
  created: 'Votre dossier de préinscription CaddyNote',
  submitted: 'Dossier de préinscription soumis — CaddyNote',
  recover: 'Lien de suivi de votre préinscription CaddyNote',
  needs_info: 'Compléments demandés — dossier CaddyNote',
  accepted: 'Dossier accepté — CaddyNote',
  rejected: 'Décision sur votre dossier — CaddyNote',
  enrolled: 'Inscription confirmée — CaddyNote',
  piece_rejected: 'Pièce à remplacer — CaddyNote',
  piece_unreadable: 'Pièce illisible — CaddyNote',
  original_requested: 'Original à présenter — CaddyNote',
  piece_expired: 'Pièce expirée — CaddyNote',
  payment_due: 'Paiement attendu — CaddyNote',
  payment_received: 'Paiement reçu — CaddyNote',
};

const introFor = (kind: AdmissionNoticeKind, student: string, detail?: string): string => {
  const d = detail ? ` (${detail})` : '';
  switch (kind) {
    case 'created':
      return `Votre dossier de préinscription pour <strong>${student}</strong> a été créé.`;
    case 'submitted':
      return `Votre dossier de préinscription pour <strong>${student}</strong> a bien été soumis.`;
    case 'recover':
      return `Voici le lien pour consulter le dossier de préinscription de <strong>${student}</strong>.`;
    case 'needs_info':
      return `Des compléments sont demandés pour le dossier de <strong>${student}</strong>${d}.`;
    case 'accepted':
      return `Le dossier de <strong>${student}</strong> a été accepté${d}.`;
    case 'rejected':
      return `Le dossier de <strong>${student}</strong> a été refusé${d}.`;
    case 'enrolled':
      return `L’inscription de <strong>${student}</strong> est confirmée${d}.`;
    case 'piece_rejected':
      return `Une pièce du dossier de <strong>${student}</strong> a été refusée${d}. Merci de la remplacer.`;
    case 'piece_unreadable':
      return `Une pièce du dossier de <strong>${student}</strong> est illisible${d}. Merci de la renvoyer.`;
    case 'original_requested':
      return `Un original physique est attendu pour le dossier de <strong>${student}</strong>${d}.`;
    case 'piece_expired':
      return `Une pièce du dossier de <strong>${student}</strong> a expiré${d}. Merci de la renouveler.`;
    case 'payment_due':
      return `Un paiement est attendu pour le dossier de <strong>${student}</strong>${d}.`;
    case 'payment_received':
      return `Le paiement pour le dossier de <strong>${student}</strong> a été reçu${d}.`;
  }
};

const plainIntro = (html: string) => html.replace(/<[^>]+>/g, '');

export const sendAdmissionFollowEmail = async (params: {
  to: string;
  studentFirstName: string;
  studentLastName: string;
  publicToken: string;
  kind: AdmissionFollowEmailKind;
}): Promise<boolean> => {
  const result = await notifyAdmissionContact({ ...params, kind: params.kind });
  return result.email;
};

export const notifyAdmissionContact = async (params: {
  to: string;
  studentFirstName: string;
  studentLastName: string;
  publicToken: string;
  kind: AdmissionNoticeKind;
  detail?: string;
  phone?: string | null;
  channelOverride?: { email?: boolean; sms?: boolean; whatsapp?: boolean };
}): Promise<{ email: boolean; sms: boolean; whatsapp: boolean }> => {
  const url = admissionFollowUrl(params.publicToken);
  const student = `${params.studentFirstName} ${params.studentLastName}`.trim();
  const intro = introFor(params.kind, student, params.detail);
  const subject = SUBJECTS[params.kind];

  const html = `<p>Bonjour,</p>
<p>${intro}</p>
<p>Pour suivre l’avancement ou compléter le dossier, ouvrez simplement ce lien&nbsp;:<br/>
<a href="${url}">${url}</a></p>
<p>Conservez cet e-mail : vous pourrez y revenir à tout moment. Si vous n’êtes pas à l’origine de cette demande, ignorez ce message.</p>
<p>— CaddyNote</p>`;

  const text = `${plainIntro(intro)}\n\nLien de suivi : ${url}\n`;
  const smsBody = `${plainIntro(intro)} Lien: ${url}`;

  const allowEmail = params.channelOverride?.email !== false;
  const allowSms = params.channelOverride?.sms !== false;
  const allowWhatsapp = params.channelOverride?.whatsapp !== false;

  let email = false;
  let sms = false;
  let whatsapp = false;

  if (allowEmail && isEmailConfigured()) {
    email = await sendEmail({ to: params.to, subject, html, text }).catch(() => false);
  }

  const phone = params.phone?.trim();
  if (phone) {
    if (allowSms && isSmsConfigured()) {
      sms = await sendSms(phone, smsBody)
        .then(() => true)
        .catch(() => false);
    }
    if (allowWhatsapp && isWhatsAppConfigured()) {
      whatsapp = await sendWhatsApp(phone, smsBody)
        .then(() => true)
        .catch(() => false);
    }
  }

  return { email, sms, whatsapp };
};

export const admissionEmailAvailable = (): boolean => isEmailConfigured();

/** Extrait un téléphone utile depuis les responsables JSON. */
export const pickGuardianPhone = (guardians: unknown): string | null => {
  if (!Array.isArray(guardians)) return null;
  for (const g of guardians) {
    if (g && typeof g === 'object' && typeof (g as { phone?: unknown }).phone === 'string') {
      const phone = (g as { phone: string }).phone.trim();
      if (phone) return phone;
    }
  }
  return null;
};
