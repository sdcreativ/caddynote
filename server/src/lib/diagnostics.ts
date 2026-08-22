import { isS3Configured } from './s3.js';
import { getFileStorageMode } from './fileStorage.js';
import { isStripeConfigured, isStripeWebhookConfigured } from './stripeClient.js';
import { isCinetPayConfigured } from './cinetpay.js';
import { isEmailConfigured, isLocalSmtpRelay } from './email.js';
import { isSmsConfigured } from './sms.js';
import { isAntivirusConfigured } from './antivirus.js';
import { isTestMode } from './testMode.js';

/**
 * Diagnostic d’intégrations pour la dureté production — booléens uniquement,
 * jamais de secrets ni de valeurs d’environnement brutes.
 */
export interface IntegrationStatus {
  key: string;
  configured: boolean;
  notes?: string;
}

export const getIntegrationsStatus = (): IntegrationStatus[] => {
  const storageMode = getFileStorageMode();
  return [
    {
      key: 'test_mode',
      configured: isTestMode(),
      notes: isTestMode()
        ? 'CADDYNOTE_TEST_MODE — intégrations sortantes forcées off (interdit en prod)'
        : 'Désactivé (attendu en pilote/prod)',
    },
    {
      key: 'file_storage',
      configured: true,
      notes:
        storageMode === 's3'
          ? 'Mode S3'
          : 'Repli local (server/uploads) — OK pilote ; brancher S3 pour prod multi-instance',
    },
    {
      key: 's3',
      configured: isS3Configured(),
      notes: isS3Configured()
        ? undefined
        : 'Bucket S3 absent — pièces d’admission en stockage local si API mono-instance',
    },
    {
      key: 'stripe',
      configured: isStripeConfigured(),
      notes: isStripeConfigured()
        ? isStripeWebhookConfigured()
          ? undefined
          : 'STRIPE_WEBHOOK_SECRET manquant — webhooks 501'
        : 'Paiements carte / abonnements en 501',
    },
    {
      key: 'stripe_webhook',
      configured: isStripeWebhookConfigured(),
    },
    {
      key: 'cinetpay',
      configured: isCinetPayConfigured(),
      notes: isCinetPayConfigured() ? undefined : 'Mobile Money en 501',
    },
    {
      key: 'smtp',
      configured: isEmailConfigured(),
      notes: isEmailConfigured()
        ? isLocalSmtpRelay()
          ? `Relais local (Mailpit) — UI ${process.env.MAILPIT_UI_URL || 'http://localhost:8025'}`
          : undefined
        : 'SMTP absent — e-mails journalisés (liens admission / reset non livrés)',
    },
    {
      key: 'twilio',
      configured: isSmsConfigured(),
      notes: isSmsConfigured() ? undefined : 'SMS/WhatsApp en 501',
    },
    {
      key: 'clamav',
      configured: isAntivirusConfigured(),
      notes: isAntivirusConfigured() ? undefined : 'Scan antivirus désactivé (DOC-005)',
    },
    {
      key: 'file_purge',
      configured: process.env.FILE_PURGE_ENABLED === 'true',
      notes: 'Purge destructrice — dry-run par défaut tant que FILE_PURGE_ENABLED≠true',
    },
  ];
};

/** Checklist minimale pour un pilote 1 école (hors billing live). */
export const getPilotReadiness = (): {
  ready: boolean;
  blockers: string[];
  warnings: string[];
} => {
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (isTestMode()) {
    blockers.push('CADDYNOTE_TEST_MODE encore actif — MFA assouplie et intégrations coupées');
  }
  if (!isEmailConfigured()) {
    warnings.push('SMTP non configuré — les e-mails de suivi resteront en journal serveur');
  }
  if (!isS3Configured()) {
    warnings.push('S3 absent — stockage local OK pour un pilote mono-instance uniquement');
  }

  return { ready: blockers.length === 0, blockers, warnings };
};
