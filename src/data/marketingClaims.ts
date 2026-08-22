/**
 * §6 — inventaire des promesses marketing vs briques réellement branchées.
 * Sert de garde-fou : le catalogue public ne doit pas affirmer un chantier
 * encore hors produit (chat live, géoloc, APM, etc.).
 */
export type ClaimStatus = 'shipped' | 'partial' | 'sandbox';

export type MarketingClaim = {
  id: string;
  claim: string;
  status: ClaimStatus;
  /** Module / route / doc de référence. */
  evidence: string;
};

export const MARKETING_CLAIMS: MarketingClaim[] = [
  {
    id: 'attendance-offline',
    claim: 'Appel hors ligne avec synchronisation',
    status: 'shipped',
    evidence: 'offlineDb / QuickAttendance / PWA',
  },
  {
    id: 'attendance-alerts',
    claim: 'Alertes parents SMS / push sur absence',
    status: 'partial',
    evidence: 'absenceAlertCron + communications (selon config / opt-out)',
  },
  {
    id: 'grades-bulletins',
    claim: 'Notes, moyennes, bulletins PDF',
    status: 'shipped',
    evidence: 'grades + documents report-card',
  },
  {
    id: 'finance-mobile-money',
    claim: 'Paiements Mobile Money / factures',
    status: 'partial',
    evidence: 'finance + CinetPay sandbox / config',
  },
  {
    id: 'comms-email-sms',
    claim: 'E-mail / SMS vers familles',
    status: 'shipped',
    evidence: 'communications (sandbox hors prod)',
  },
  {
    id: 'comms-whatsapp',
    claim: 'WhatsApp natif grand public',
    status: 'sandbox',
    evidence: 'canal optionnel — ne pas promettre comme chat live',
  },
  {
    id: 'admissions',
    claim: 'Préinscriptions publiques',
    status: 'shipped',
    evidence: '/admissions',
  },
  {
    id: 'support-tickets',
    claim: 'Tickets support structurés',
    status: 'shipped',
    evidence: '/support + SupportOps',
  },
  {
    id: 'live-chat',
    claim: 'Chat en ligne immédiat',
    status: 'sandbox',
    evidence: 'non livré — guides pointent formulaire / tickets',
  },
];

/** Expressions interdites dans le copy marketing public (catalogue + guides). */
export const FORBIDDEN_MARKETING_PHRASES = [
  'chat en ligne',
  'assistance immédiate',
  'en temps réel',
  'géolocalisation',
  '999% d’uptime',
] as const;
