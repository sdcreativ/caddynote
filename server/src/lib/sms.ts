import Twilio from 'twilio';
import { areExternalServicesDisabled } from './testMode.js';

/**
 * SMS + WhatsApp Business via Twilio (COM-001) — remplace l'absence totale
 * d'intégration SMS/WhatsApp constatée par l'audit. Gated par variables
 * d'environnement, même principe que Stripe/CinetPay/S3/SMTP ailleurs dans
 * l'API : 501 explicite tant que non configuré, jamais d'échec silencieux.
 *
 * Variables requises : TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN.
 * SMS : TWILIO_SMS_FROM (numéro Twilio, ex. "+15551234567").
 * WhatsApp : TWILIO_WHATSAPP_FROM (ex. "whatsapp:+14155238886" — le préfixe
 * "whatsapp:" est ajouté automatiquement s'il est absent de la variable).
 */

let client: ReturnType<typeof Twilio> | null = null;

const getClient = () => {
  if (!client) {
    client = Twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);
  }
  return client;
};

const hasTwilioCredentials = (): boolean =>
  !areExternalServicesDisabled() &&
  !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);

export const isSmsConfigured = (): boolean => hasTwilioCredentials() && !!process.env.TWILIO_SMS_FROM;
export const isWhatsAppConfigured = (): boolean => hasTwilioCredentials() && !!process.env.TWILIO_WHATSAPP_FROM;

const withWhatsAppPrefix = (address: string): string => (address.startsWith('whatsapp:') ? address : `whatsapp:${address}`);

export interface SendResult {
  providerMessageId: string;
}

/** Statut de livraison Twilio à la création (avant tout callback webhook). */
export const sendSms = async (to: string, body: string): Promise<SendResult> => {
  const message = await getClient().messages.create({ to, from: process.env.TWILIO_SMS_FROM!, body });
  return { providerMessageId: message.sid };
};

export const sendWhatsApp = async (to: string, body: string): Promise<SendResult> => {
  const message = await getClient().messages.create({
    to: withWhatsAppPrefix(to),
    from: withWhatsAppPrefix(process.env.TWILIO_WHATSAPP_FROM!),
    body,
  });
  return { providerMessageId: message.sid };
};

/**
 * Vérifie la signature `X-Twilio-Signature` d'une requête webhook de statut
 * de livraison (COM-004) — jamais de mise à jour de statut basée sur le
 * corps brut sans cette vérification serveur-à-serveur (même principe FIN-005
 * que pour les webhooks de paiement).
 */
export const isValidTwilioSignature = (signature: string | undefined, url: string, params: Record<string, unknown>): boolean => {
  if (!signature || !process.env.TWILIO_AUTH_TOKEN) return false;
  return Twilio.validateRequest(process.env.TWILIO_AUTH_TOKEN, signature, url, params as Record<string, string>);
};
