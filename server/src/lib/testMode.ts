/**
 * Mode test / recette locale : coupe toutes les connexions sortantes réelles
 * (SMTP, Stripe, CinetPay, Twilio, S3, Anthropic, ClamAV) et assouplit la
 * MFA obligatoire pour pouvoir se connecter avec les comptes démo.
 *
 * Activer avec `CADDYNOTE_TEST_MODE=true` dans `server/.env`.
 * Ne jamais activer en production.
 */
export const isTestMode = (): boolean =>
  process.env.CADDYNOTE_TEST_MODE === 'true' || process.env.CADDYNOTE_TEST_MODE === '1';

/** Alias sémantique pour les gates d'intégrations. */
export const areExternalServicesDisabled = (): boolean => isTestMode();
