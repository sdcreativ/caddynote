import { prisma } from './prisma.js';
import { isEmailConfigured, sendEmail } from './email.js';
import { isSmsConfigured, isWhatsAppConfigured, sendSms, sendWhatsApp } from './sms.js';
import { resolveTemplate, renderTemplate } from './templates.js';
import { enqueueCommunicationDispatch } from './queue.js';
import { QUOTA_LABELS } from './quotas.js';
import type { StrkCommChannel, StrkCommunicationLog } from '@prisma/client';

/**
 * Cœur de l'envoi multicanal (COM-001/002/003/004), factorisé pour être
 * appelé aussi bien par `POST /communications/send` (personnel, via HTTP)
 * que par les déclencheurs automatiques serveur (ex. `absenceAlertCron.ts`,
 * PRS-004) — la résolution de modèle, le respect du consentement et la
 * traçabilité doivent être identiques dans les deux cas.
 *
 * Ne fait AUCUNE vérification d'autorisation (ORG-004) : c'est la
 * responsabilité de l'appelant (route HTTP via `getAllowedContactIds`, ou
 * tâche planifiée qui cible déjà exactement les bons destinataires par
 * construction — ex. les responsables actifs d'un élève donné).
 *
 * Découplage envoi/traitement (Lot 6) : la préparation (validation, modèle,
 * consentement, création du journal) est désormais distincte de l'appel
 * réel au fournisseur (`dispatchCommunication`). `sendCommunication` enchaîne
 * les deux immédiatement (comportement synchrone inchangé — utilisé par les
 * déclencheurs planifiés, qui ne sont pas dans une requête HTTP et n'ont
 * donc pas le problème que ce découplage résout). `queueCommunication` ne
 * fait que préparer et mettre en file (`lib/queue.ts`, pg-boss) : c'est ce
 * que `POST /communications/send` utilise désormais.
 */
export interface SendCommunicationParams {
  recipientId: string;
  channel: StrkCommChannel;
  institutionId?: string | null;
  useCase?: string;
  locale?: string;
  variables?: Record<string, string>;
  subject?: string;
  body?: string;
  isCritical?: boolean;
  requestedBy: string;
}

export type SendCommunicationResult =
  | { ok: true; log: StrkCommunicationLog }
  | {
      ok: false;
      reason:
        | 'not_configured'
        | 'missing_address'
        | 'missing_content'
        | 'recipient_not_found'
        | 'send_failed'
        | 'quota_exceeded'
        | 'channel_disabled';
      error: string;
      log?: StrkCommunicationLog;
    };

/** Kill-switch plateforme (`settings/system/commsKillSwitch`). */
export const getCommsKillSwitch = async (): Promise<{
  email: boolean;
  sms: boolean;
  whatsapp: boolean;
}> => {
  const setting = await prisma.strkSetting.findUnique({
    where: { category_key: { category: 'system', key: 'commsKillSwitch' } },
    select: { value: true },
  });
  const v = (setting?.value as Record<string, boolean> | null) ?? {};
  return {
    email: !!v.email,
    sms: !!v.sms,
    whatsapp: !!v.whatsapp,
  };
};

const isChannelKilled = async (channel: StrkCommChannel): Promise<boolean> => {
  if (channel === 'push') return false;
  const kill = await getCommsKillSwitch();
  if (channel === 'email') return kill.email;
  if (channel === 'sms') return kill.sms;
  if (channel === 'whatsapp') return kill.whatsapp;
  return false;
};

/**
 * Canal choisi par ordre de préférence décroissant : SMS (le plus fiable
 * pour joindre un responsable rapidement) si configuré et numéro connu,
 * sinon e-mail si configuré et adresse connue, sinon push (toujours
 * disponible, aucune dépendance externe) en dernier recours. Un opt-out
 * explicite (COM-003) sur le canal choisi est de toute façon respecté par
 * `sendCommunication` lui-même — cette sélection ne fait que choisir le
 * canal le plus probable d'être configuré et effectif.
 *
 * Partagé par les déclencheurs automatiques serveur qui doivent joindre un
 * responsable sans qu'un humain choisisse le canal (`absenceAlertCron.ts`
 * PRS-004, `attendanceThresholds.ts` PRS-006).
 */
export const pickPreferredChannel = (
  guardian: { phoneNumber: string | null; email: string | null },
  preferences: Map<StrkCommChannel, boolean>
): StrkCommChannel => {
  if (isSmsConfigured() && guardian.phoneNumber && preferences.get('sms') !== false) return 'sms';
  if (isEmailConfigured() && guardian.email && preferences.get('email') !== false) return 'email';
  return 'push';
};

type PrepareResult =
  | { ok: true; log: StrkCommunicationLog; readyToDispatch: boolean }
  | {
      ok: false;
      reason:
        | 'not_configured'
        | 'missing_address'
        | 'missing_content'
        | 'recipient_not_found'
        | 'quota_exceeded'
        | 'channel_disabled';
      error: string;
    };

/** Validation, résolution de modèle, vérification du consentement, et
 * création du journal (`StrkCommunicationLog`, statut `queued` — ou déjà
 * `failed` si le destinataire a désactivé ce canal, `readyToDispatch:
 * false` dans ce cas : rien à envoyer). Ne fait jamais d'appel réseau. */
const prepareCommunication = async (params: SendCommunicationParams): Promise<PrepareResult> => {
  const { recipientId, channel, useCase, locale = 'fr', variables = {}, isCritical = false, requestedBy } = params;

  if (await isChannelKilled(channel)) {
    return {
      ok: false,
      reason: 'channel_disabled',
      error: `Canal ${channel} désactivé par kill-switch plateforme`,
    };
  }

  const recipient = await prisma.strkProfile.findUnique({ where: { id: recipientId } });
  if (!recipient) {
    return { ok: false, reason: 'recipient_not_found', error: 'Destinataire introuvable' };
  }

  if (channel === 'email' && !isEmailConfigured()) {
    return { ok: false, reason: 'not_configured', error: "L'e-mail n'est pas configuré sur cette instance (variables SMTP_* manquantes)." };
  }
  if (channel === 'sms' && !isSmsConfigured()) {
    return { ok: false, reason: 'not_configured', error: "Le SMS n'est pas configuré sur cette instance (variables TWILIO_* manquantes)." };
  }
  if (channel === 'whatsapp' && !isWhatsAppConfigured()) {
    return { ok: false, reason: 'not_configured', error: "WhatsApp n'est pas configuré sur cette instance (TWILIO_WHATSAPP_FROM manquant)." };
  }

  // SAA-003 : SMS/WhatsApp ont un coût variable par envoi (contrairement à
  // l'e-mail/push) — quota mensuel vérifié avant toute mise en file, jamais
  // découvert après un envoi déjà facturé côté fournisseur.
  const quotaInstitutionId = recipient.institutionId ?? params.institutionId;
  if ((channel === 'sms' || channel === 'whatsapp') && quotaInstitutionId) {
    const { checkQuotaWithOverage } = await import('./overagePolicy.js');
    const smsQuota = await checkQuotaWithOverage(quotaInstitutionId, 'smsPerMonth', 1, params.requestedBy);
    if (!smsQuota.allowed) {
      return {
        ok: false,
        reason: 'quota_exceeded',
        error: `Quota de ${QUOTA_LABELS.smsPerMonth} atteint pour le plan actuel (${smsQuota.current}/${smsQuota.limit}).`,
      };
    }
  }

  const toAddress = channel === 'email' ? recipient.email : channel === 'push' ? recipient.id : recipient.phoneNumber;
  if (!toAddress) {
    return {
      ok: false,
      reason: 'missing_address',
      error: channel === 'email' ? "Le destinataire n'a pas d'adresse e-mail enregistrée" : "Le destinataire n'a pas de numéro de téléphone enregistré",
    };
  }

  // Résolution du contenu : modèle versionné (COM-002) si disponible pour ce
  // useCase/canal/langue, sinon repli sur le contenu ad-hoc fourni par
  // l'appelant (utile aux déclencheurs automatiques tant qu'aucun modèle
  // personnalisé n'a été configuré pour leur useCase).
  let subject: string | null = params.subject ?? null;
  let body: string | null = params.body ?? null;
  let templateId: string | null = null;
  if (useCase) {
    const template = await resolveTemplate(recipient.institutionId, useCase, channel, locale);
    if (template) {
      const rendered = renderTemplate(template, variables);
      subject = rendered.subject;
      body = rendered.body;
      templateId = template.id;
    }
  }
  if (!body) {
    return { ok: false, reason: 'missing_content', error: 'Un modèle (useCase) actif ou un contenu (body) est requis' };
  }

  // COM-003 : un opt-out explicite bloque l'envoi avant tout appel au
  // fournisseur — tracé comme tel, distinct d'un échec technique.
  const preference = await prisma.strkCommunicationPreference.findUnique({
    where: { profileId_channel: { profileId: recipientId, channel } },
  });
  const optedOut = preference?.optedIn === false;

  const log = await prisma.strkCommunicationLog.create({
    data: {
      institutionId: recipient.institutionId ?? params.institutionId ?? null,
      templateId,
      useCase: useCase ?? null,
      channel,
      recipientId,
      toAddress,
      subject,
      body,
      isCritical,
      requestedBy,
      status: optedOut ? 'failed' : 'queued',
      skippedOptOut: optedOut,
      errorMessage: optedOut ? 'Le destinataire a désactivé ce canal' : null,
      failedAt: optedOut ? new Date() : null,
    },
  });

  return { ok: true, log, readyToDispatch: !optedOut };
};

/** Effectue le véritable appel fournisseur pour un journal déjà créé
 * (statut `queued`) et met à jour son statut final. N'échoue jamais par
 * exception : un problème fournisseur se traduit toujours par un journal au
 * statut `failed`, jamais par une erreur non gérée (essentiel pour le
 * worker de file, qui sinon retenterait indéfiniment une erreur de
 * programmation au lieu d'une vraie panne transitoire). */
const dispatchCommunication = async (log: StrkCommunicationLog): Promise<StrkCommunicationLog> => {
  try {
    if (log.channel === 'email') {
      // Bug réel trouvé en testant le découplage envoi/traitement :
      // `sendEmail` avale déjà ses propres erreurs et renvoie `false`
      // (design voulu pour ses autres appelants — mot de passe oublié,
      // alertes d'abonnement — qui ne doivent jamais planter faute d'e-mail
      // configuré) au lieu de lever une exception. Le code d'origine
      // ignorait cette valeur de retour et marquait 'sent' même en cas
      // d'échec réel de connexion/authentification SMTP — une panne du
      // fournisseur se traduisait silencieusement par un journal 'sent'.
      const delivered = await sendEmail({ to: log.toAddress, subject: log.subject ?? '(sans objet)', html: log.body });
      if (!delivered) {
        return prisma.strkCommunicationLog.update({
          where: { id: log.id },
          data: { status: 'failed', failedAt: new Date(), errorMessage: "Échec de l'envoi e-mail (voir les journaux serveur)" },
        });
      }
      return prisma.strkCommunicationLog.update({
        where: { id: log.id },
        data: { status: 'sent', sentAt: new Date() },
      });
    }
    if (log.channel === 'sms' || log.channel === 'whatsapp') {
      const result = log.channel === 'sms' ? await sendSms(log.toAddress, log.body) : await sendWhatsApp(log.toAddress, log.body);
      return prisma.strkCommunicationLog.update({
        where: { id: log.id },
        data: { status: 'sent', sentAt: new Date(), providerMessageId: result.providerMessageId },
      });
    }
    // push : notification interne existante, "livrée" dès l'écriture en base.
    await prisma.notification.create({
      data: { userId: log.recipientId!, title: log.subject ?? 'Notification', message: log.body, type: log.isCritical ? 'warning' : 'info' },
    });
    return await prisma.strkCommunicationLog.update({
      where: { id: log.id },
      data: { status: 'delivered', sentAt: new Date(), deliveredAt: new Date() },
    });
  } catch (error) {
    console.error(`Échec d'envoi (${log.channel}) :`, error);
    return prisma.strkCommunicationLog.update({
      where: { id: log.id },
      data: { status: 'failed', failedAt: new Date(), errorMessage: error instanceof Error ? error.message : 'Erreur inconnue' },
    });
  }
};

/** Prépare puis envoie immédiatement, de façon synchrone — comportement
 * historique, inchangé. Utilisé par les déclencheurs planifiés
 * (`absenceAlertCron.ts`, `attendanceThresholds.ts`) : ils ne tournent pas
 * dans une requête HTTP, le problème que `queueCommunication` résout ne se
 * pose pas pour eux. */
export const sendCommunication = async (params: SendCommunicationParams): Promise<SendCommunicationResult> => {
  const prepared = await prepareCommunication(params);
  if (!prepared.ok) return prepared;
  if (!prepared.readyToDispatch) return { ok: true, log: prepared.log };

  const updated = await dispatchCommunication(prepared.log);
  if (updated.status === 'failed') {
    return { ok: false, reason: 'send_failed', error: "Échec de l'envoi", log: updated };
  }
  return { ok: true, log: updated };
};

/** Prépare et met en file (`lib/queue.ts`) sans attendre l'envoi réel —
 * utilisé par `POST /communications/send`. Le journal renvoyé est encore au
 * statut `queued` : c'est le worker (`registerCommunicationDispatchWorker`,
 * démarré dans `index.ts`) qui appellera `dispatchCommunicationById` plus
 * tard et fera progresser le statut vers `sent`/`delivered`/`failed`. */
export const queueCommunication = async (params: SendCommunicationParams): Promise<SendCommunicationResult> => {
  const prepared = await prepareCommunication(params);
  if (!prepared.ok) return prepared;
  if (!prepared.readyToDispatch) return { ok: true, log: prepared.log };

  await enqueueCommunicationDispatch(prepared.log.id);
  return { ok: true, log: prepared.log };
};

/** Point d'entrée du worker de file (`lib/queue.ts`) : reprend un journal par
 * son id et le traite. Idempotent — si le journal n'est déjà plus `queued`
 * (déjà traité par une tentative précédente), ne fait rien plutôt que de
 * renvoyer une seconde fois un message déjà parti. */
export const dispatchCommunicationById = async (logId: string): Promise<void> => {
  const log = await prisma.strkCommunicationLog.findUnique({ where: { id: logId } });
  if (!log) {
    console.error(`Communication ${logId} introuvable — impossible de la traiter`);
    return;
  }
  if (log.status !== 'queued') {
    return;
  }
  await dispatchCommunication(log);
};
