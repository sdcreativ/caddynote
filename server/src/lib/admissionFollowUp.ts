import { sendEmail, isEmailConfigured } from './email.js';
import { sendSms, sendWhatsApp, isSmsConfigured, isWhatsAppConfigured } from './sms.js';
import { appBaseUrl, escapeHtml, wrapTransactionalEmail } from './emailLayout.js';

/**
 * Notifications admissions multi-canal (e-mail + SMS/WhatsApp si configurés).
 * Spec §12 — destinataire = contact du dossier (pas encore de profil parent).
 */

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
  created: 'Votre dossier de préinscription est ouvert — CaddyNote',
  submitted: 'Dossier soumis — confirmation CaddyNote',
  recover: 'Votre lien de suivi de préinscription — CaddyNote',
  needs_info: 'Action requise : compléter votre dossier — CaddyNote',
  accepted: 'Bonne nouvelle : dossier accepté — CaddyNote',
  rejected: 'Décision concernant votre dossier — CaddyNote',
  enrolled: 'Inscription confirmée — CaddyNote',
  piece_rejected: 'Pièce à remplacer sur votre dossier — CaddyNote',
  piece_unreadable: 'Pièce illisible — merci de la renvoyer — CaddyNote',
  original_requested: 'Original à présenter — CaddyNote',
  piece_expired: 'Pièce expirée à renouveler — CaddyNote',
  payment_due: 'Paiement des frais de dossier — CaddyNote',
  payment_received: 'Paiement bien reçu — CaddyNote',
};

const titleFor = (kind: AdmissionNoticeKind): string => {
  switch (kind) {
    case 'created':
      return 'Votre dossier est créé';
    case 'submitted':
      return 'Dossier bien soumis';
    case 'recover':
      return 'Retrouvez votre suivi';
    case 'needs_info':
      return 'Compléments demandés';
    case 'accepted':
      return 'Dossier accepté';
    case 'rejected':
      return 'Décision sur votre dossier';
    case 'enrolled':
      return 'Inscription confirmée';
    case 'piece_rejected':
      return 'Pièce à remplacer';
    case 'piece_unreadable':
      return 'Pièce illisible';
    case 'original_requested':
      return 'Original à présenter';
    case 'piece_expired':
      return 'Pièce expirée';
    case 'payment_due':
      return 'Paiement attendu';
    case 'payment_received':
      return 'Paiement reçu';
  }
};

const nextStepsFor = (kind: AdmissionNoticeKind): string[] => {
  switch (kind) {
    case 'created':
      return [
        'Ouvrez le lien de suivi ci-dessous (conservez cet e-mail).',
        'Déposez les pièces demandées par l’établissement.',
        'Soumettez le dossier lorsque tout est prêt.',
      ];
    case 'submitted':
      return [
        'L’établissement instruit votre dossier.',
        'Vous serez notifié(e) en cas de complément ou de décision.',
        'Le paiement des frais éventuels se fait depuis la page de suivi.',
      ];
    case 'recover':
      return [
        'Ce lien remplace les anciens accès à votre dossier.',
        'Vous pouvez y déposer des pièces ou consulter le statut.',
      ];
    case 'needs_info':
      return [
        'Ouvrez le suivi pour voir les éléments demandés.',
        'Complétez puis renvoyez le dossier.',
      ];
    case 'accepted':
      return [
        'Consultez le suivi pour les éventuelles formalités restantes.',
        'L’établissement vous indiquera la suite de l’inscription.',
      ];
    case 'rejected':
      return ['Le détail est disponible sur la page de suivi.', 'Contactez l’établissement si besoin de clarification.'];
    case 'enrolled':
      return [
        'L’élève est inscrit : les accès et informations utiles suivront selon l’établissement.',
      ];
    case 'piece_rejected':
    case 'piece_unreadable':
    case 'piece_expired':
      return ['Ouvrez le suivi et remplacez la pièce concernée.', 'Soumettez à nouveau si nécessaire.'];
    case 'original_requested':
      return ['Présentez l’original sur place selon les consignes de l’établissement.'];
    case 'payment_due':
      return ['Réglez les frais depuis la page de suivi (Mobile Money ou carte si proposés).'];
    case 'payment_received':
      return ['Merci. Le statut de votre dossier est à jour sur la page de suivi.'];
  }
};

const leadFor = (kind: AdmissionNoticeKind, student: string, detail?: string): string => {
  const safeStudent = escapeHtml(student);
  const d = detail ? ` <em>(${escapeHtml(detail)})</em>` : '';
  switch (kind) {
    case 'created':
      return `Bonjour,<br/><br/>Le dossier de préinscription de <strong>${safeStudent}</strong> a bien été ouvert. Ce message contient votre <strong>lien personnel de suivi</strong> — c’est le seul endroit pour déposer les pièces, suivre l’avancement et finaliser la demande.`;
    case 'submitted':
      return `Bonjour,<br/><br/>Le dossier de <strong>${safeStudent}</strong> a été <strong>soumis</strong> avec succès. L’établissement peut désormais l’instruire.`;
    case 'recover':
      return `Bonjour,<br/><br/>Voici à nouveau le lien de suivi pour le dossier de préinscription de <strong>${safeStudent}</strong>.`;
    case 'needs_info':
      return `Bonjour,<br/><br/>L’établissement demande des compléments pour le dossier de <strong>${safeStudent}</strong>${d}.`;
    case 'accepted':
      return `Bonjour,<br/><br/>Bonne nouvelle : le dossier de <strong>${safeStudent}</strong> a été <strong>accepté</strong>${d}.`;
    case 'rejected':
      return `Bonjour,<br/><br/>Une décision a été prise concernant le dossier de <strong>${safeStudent}</strong>${d}.`;
    case 'enrolled':
      return `Bonjour,<br/><br/>L’inscription de <strong>${safeStudent}</strong> est <strong>confirmée</strong>${d}.`;
    case 'piece_rejected':
      return `Bonjour,<br/><br/>Une pièce du dossier de <strong>${safeStudent}</strong> a été refusée${d}. Merci de la remplacer via le lien de suivi.`;
    case 'piece_unreadable':
      return `Bonjour,<br/><br/>Une pièce du dossier de <strong>${safeStudent}</strong> est illisible${d}. Merci de la renvoyer.`;
    case 'original_requested':
      return `Bonjour,<br/><br/>Un original physique est attendu pour le dossier de <strong>${safeStudent}</strong>${d}.`;
    case 'piece_expired':
      return `Bonjour,<br/><br/>Une pièce du dossier de <strong>${safeStudent}</strong> a expiré${d}. Merci de la renouveler.`;
    case 'payment_due':
      return `Bonjour,<br/><br/>Un paiement est attendu pour le dossier de <strong>${safeStudent}</strong>${d}.`;
    case 'payment_received':
      return `Bonjour,<br/><br/>Nous avons bien reçu le paiement pour le dossier de <strong>${safeStudent}</strong>${d}.`;
  }
};

const plainIntro = (html: string) =>
  html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

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
  const lead = leadFor(params.kind, student, params.detail);
  const steps = nextStepsFor(params.kind);
  const subject = SUBJECTS[params.kind];
  const title = titleFor(params.kind);

  const stepsHtml = steps
    .map(
      (s, i) =>
        `<li style="margin:0 0 8px;padding:0;">${i + 1}. ${escapeHtml(s)}</li>`
    )
    .join('');

  const bodyHtml = `
    <p style="margin:0 0 16px;">${lead}</p>
    <p style="margin:0 0 8px;font-weight:600;color:#0B1F3A;">Prochaines étapes</p>
    <ol style="margin:0 0 16px;padding-left:18px;">${stepsHtml}</ol>
  `;

  const html = wrapTransactionalEmail({
    preheader: `${title} — ${student}`,
    title,
    bodyHtml,
    cta: { label: 'Ouvrir mon suivi de dossier', url },
    footerNote:
      'Conservez cet e-mail : le lien de suivi est personnel. Si vous n’êtes pas à l’origine de cette demande, vous pouvez ignorer ce message.',
  });

  const text = `${plainIntro(lead)}

Prochaines étapes :
${steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}

Lien de suivi : ${url}
`;

  const smsBody = `${title} (${student}). Suivi : ${url}`;

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
