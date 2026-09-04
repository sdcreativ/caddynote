import { createHash, timingSafeEqual } from 'node:crypto';
import { areExternalServicesDisabled } from './testMode.js';

/**
 * Mobile Money via CinetPay (Checkout API v2) — Orange Money, MTN Mobile
 * Money, Moov, Wave et carte bancaire via une seule intégration hébergée
 * (redirection, comme Stripe Checkout). Remplace/complète Stripe pour les
 * frais de scolarité établissement ↔ parent (FIN-003), en Afrique de
 * l'Ouest/Centrale.
 *
 * ⚠️ Les noms de champs ci-dessous sont basés sur la documentation publique
 * CinetPay (Checkout API v2, https://api-checkout.cinetpay.com/v2/payment) —
 * à revérifier contre la documentation à jour / un compte sandbox CinetPay
 * avant mise en production, l'accès direct à docs.cinetpay.com n'ayant pas
 * été possible depuis cet environnement de développement.
 *
 * Variables requises : CINETPAY_API_KEY, CINETPAY_SITE_ID.
 *
 * FIN-005 (confirmation serveur uniquement après webhook signé) : le
 * webhook `notify_url` de CinetPay ne fait ici que déclencher un appel de
 * vérification serveur-à-serveur (`checkTransactionStatus`) — le statut du
 * paiement n'est JAMAIS déduit du seul corps de la requête webhook ni du
 * retour navigateur, uniquement de cet appel de contrôle.
 */

const CHECKOUT_BASE_URL = 'https://api-checkout.cinetpay.com/v2';

export const CINETPAY_TRANS_ID_RE = /^[A-Za-z0-9_-]{8,80}$/;

const timingSafeHexEqual = (a: string, b: string): boolean => {
  try {
    const left = Buffer.from(a, 'hex');
    const right = Buffer.from(b, 'hex');
    return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
  } catch {
    return false;
  }
};

/** Corps notify_url : id borné, site_id aligné, HMAC si `CINETPAY_WEBHOOK_SECRET`. */
export const parseCinetPayNotify = (
  body: unknown
): { ok: true; transactionId: string } | { ok: false; error: string } => {
  if (!body || typeof body !== 'object') return { ok: false, error: 'transaction_id manquant' };
  const record = body as Record<string, unknown>;
  const transactionId = String(record.cpm_trans_id ?? record.transaction_id ?? '').trim();
  if (!CINETPAY_TRANS_ID_RE.test(transactionId)) return { ok: false, error: 'transaction_id manquant' };

  const expectedSite = (process.env.CINETPAY_SITE_ID || '').trim();
  const siteId = String(record.cpm_site_id ?? record.site_id ?? '').trim();
  if (expectedSite && siteId && siteId !== expectedSite) {
    return { ok: false, error: 'site_id invalide' };
  }

  const secret = (process.env.CINETPAY_WEBHOOK_SECRET || '').trim();
  if (secret) {
    const sig = String(record.cpm_signature ?? record.signature ?? '').trim().toLowerCase();
    const payload = `${expectedSite || siteId}${transactionId}${String(record.cpm_trans_date ?? '')}${String(record.cpm_amount ?? '')}${String(record.cpm_currency ?? '')}`;
    const expected = createHash('sha256').update(`${payload}${secret}`).digest('hex');
    if (!timingSafeHexEqual(sig, expected)) {
      return { ok: false, error: 'signature invalide' };
    }
  }

  return { ok: true, transactionId };
};

export const isCinetPayConfigured = (): boolean =>
  !areExternalServicesDisabled() && !!(process.env.CINETPAY_API_KEY && process.env.CINETPAY_SITE_ID);

export interface InitiatePaymentParams {
  transactionId: string;
  amountCents: number;
  currency: string;
  description: string;
  customerName: string;
  customerSurname: string;
  customerEmail: string;
  customerPhoneNumber: string;
  notifyUrl: string;
  returnUrl: string;
  /** 'ALL' | 'MOBILE_MONEY' | 'CREDIT_CARD' */
  channels?: string;
}

interface CinetPayInitiateResponse {
  code: string;
  message: string;
  description?: string;
  data?: { payment_token: string; payment_url: string };
}

export const initiatePayment = async (
  params: InitiatePaymentParams,
): Promise<{ paymentUrl: string; paymentToken: string }> => {
  const response = await fetch(`${CHECKOUT_BASE_URL}/payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildInitiatePaymentBody(params)),
  });

  const body = (await response.json()) as CinetPayInitiateResponse;
  if (!response.ok || !body.data?.payment_url) {
    throw new Error(`CinetPay: échec de l'initialisation du paiement (${body.code ?? response.status} ${body.message ?? ''})`);
  }
  return { paymentUrl: body.data.payment_url, paymentToken: body.data.payment_token };
};

/** Contrat Checkout API v2 — champs envoyés à /v2/payment (sandbox à
 * revalider avec un compte réel via `npm run validate:integrations`). */
export const buildInitiatePaymentBody = (params: InitiatePaymentParams) => ({
  apikey: process.env.CINETPAY_API_KEY,
  site_id: process.env.CINETPAY_SITE_ID,
  transaction_id: params.transactionId,
  // CinetPay attend un montant en unité principale (pas en centimes) —
  // conversion ici pour garder le reste de l'application en entiers.
  amount: Math.round(params.amountCents / 100),
  currency: params.currency,
  description: params.description,
  notify_url: params.notifyUrl,
  return_url: params.returnUrl,
  channels: params.channels ?? 'ALL',
  customer_name: params.customerName,
  customer_surname: params.customerSurname,
  customer_email: params.customerEmail,
  customer_phone_number: params.customerPhoneNumber,
});

export const buildCheckPaymentBody = (transactionId: string) => ({
  apikey: process.env.CINETPAY_API_KEY,
  site_id: process.env.CINETPAY_SITE_ID,
  transaction_id: transactionId,
});

export interface CinetPayCheckResult {
  status: 'ACCEPTED' | 'REFUSED' | 'PENDING' | string;
  amount?: number;
  currency?: string;
  operatorId?: string;
  paymentMethod?: string;
}

interface CinetPayCheckResponse {
  code: string;
  message: string;
  data?: {
    status: string;
    amount?: number;
    currency?: string;
    operator_id?: string;
    payment_method?: string;
  };
}

/** Source de vérité unique pour savoir si un paiement est réellement passé —
 * jamais le corps du webhook ni le retour navigateur (FIN-005). */
export const checkTransactionStatus = async (transactionId: string): Promise<CinetPayCheckResult> => {
  const response = await fetch(`${CHECKOUT_BASE_URL}/payment/check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildCheckPaymentBody(transactionId)),
  });
  const body = (await response.json()) as CinetPayCheckResponse;
  if (!response.ok || !body.data) {
    throw new Error(`CinetPay: échec de la vérification du paiement (${body.code ?? response.status} ${body.message ?? ''})`);
  }
  return {
    status: body.data.status as CinetPayCheckResult['status'],
    amount: body.data.amount,
    currency: body.data.currency,
    operatorId: body.data.operator_id,
    paymentMethod: body.data.payment_method,
  };
};
