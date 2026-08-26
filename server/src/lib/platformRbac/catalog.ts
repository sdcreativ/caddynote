/**
 * Catalogue de permissions atomiques — administration de la plateforme CaddyNote
 * (équipe éditeur SDCREATIV). Deny-by-default : toute permission non accordée est refusée.
 * @see docs/CaddyNote_Roles_Administration_Plateforme_SDCREATIV.docx.md
 */

export const PLATFORM_PERMISSION_DOMAINS = [
  'governance',
  'tenants',
  'users',
  'rbac',
  'product',
  'ops',
  'security',
  'compliance',
  'commercial',
  'billing',
  'payments',
  'support',
  'content',
  'data',
  'integrations',
  'audit',
] as const;

export type PlatformPermissionDomain = (typeof PLATFORM_PERMISSION_DOMAINS)[number];

export type PlatformPermissionCode =
  | 'platform.console.access'
  | 'platform.governance.read'
  | 'platform.governance.approve'
  | 'platform.rbac.read'
  | 'platform.rbac.manage'
  | 'platform.rbac.promote_super_admin'
  | 'platform.users.read'
  | 'platform.users.manage'
  | 'platform.users.reset_mfa'
  | 'platform.users.reset_password'
  | 'platform.tenants.read'
  | 'platform.tenants.manage'
  | 'platform.tenants.freeze'
  | 'platform.tenants.onboard'
  | 'platform.settings.read'
  | 'platform.settings.manage'
  | 'platform.feature_flags.manage'
  | 'platform.product.read'
  | 'platform.product.manage'
  | 'platform.ops.metrics'
  | 'platform.ops.jobs'
  | 'platform.ops.diagnostics'
  | 'platform.ops.backups'
  | 'platform.security.read'
  | 'platform.security.manage'
  | 'platform.security.incident'
  | 'platform.compliance.read'
  | 'platform.compliance.manage'
  | 'platform.audit.read'
  | 'platform.audit.export'
  | 'platform.commercial.read'
  | 'platform.commercial.manage'
  | 'platform.partners.read'
  | 'platform.partners.manage'
  | 'platform.billing.read'
  | 'platform.billing.manage'
  | 'platform.billing.dunning'
  | 'platform.payments.read'
  | 'platform.payments.reconcile'
  | 'platform.refunds.request'
  | 'platform.refunds.approve'
  | 'platform.fraud.read'
  | 'platform.support.tickets'
  | 'platform.support.impersonate'
  | 'platform.support.contact_inbox'
  | 'platform.comms.campaigns'
  | 'platform.content.manage'
  | 'platform.analytics.read'
  | 'platform.data.steward'
  | 'platform.refs.manage'
  | 'platform.integrations.manage'
  | 'platform.integrations.desps'
  | 'platform.country.scope';

export type PlatformPermissionDef = {
  code: PlatformPermissionCode;
  domain: PlatformPermissionDomain;
  description: string;
};

export const PLATFORM_PERMISSIONS: readonly PlatformPermissionDef[] = [
  { code: 'platform.console.access', domain: 'governance', description: 'Accéder à la console Super Admin' },
  { code: 'platform.governance.read', domain: 'governance', description: 'Consulter indicateurs consolidés et politiques' },
  { code: 'platform.governance.approve', domain: 'governance', description: 'Approuver décisions stratégiques' },
  { code: 'platform.rbac.read', domain: 'rbac', description: 'Consulter rôles et attributions plateforme' },
  { code: 'platform.rbac.manage', domain: 'rbac', description: 'Attribuer / révoquer rôles plateforme' },
  { code: 'platform.rbac.promote_super_admin', domain: 'rbac', description: 'Nommer ou révoquer un super administrateur' },
  { code: 'platform.users.read', domain: 'users', description: 'Lister les comptes (annuaire global)' },
  { code: 'platform.users.manage', domain: 'users', description: 'Créer / modifier / désactiver des comptes' },
  { code: 'platform.users.reset_mfa', domain: 'users', description: 'Réinitialiser la MFA d’un compte' },
  { code: 'platform.users.reset_password', domain: 'users', description: 'Déclencher une réinit. mot de passe' },
  { code: 'platform.tenants.read', domain: 'tenants', description: 'Lister établissements / tenants' },
  { code: 'platform.tenants.manage', domain: 'tenants', description: 'Créer / configurer des tenants' },
  { code: 'platform.tenants.freeze', domain: 'tenants', description: 'Geler / dégeler un tenant' },
  { code: 'platform.tenants.onboard', domain: 'tenants', description: 'Onboarding et mise en service' },
  { code: 'platform.settings.read', domain: 'ops', description: 'Lire paramètres plateforme' },
  { code: 'platform.settings.manage', domain: 'ops', description: 'Modifier paramètres plateforme' },
  { code: 'platform.feature_flags.manage', domain: 'product', description: 'Gérer feature flags' },
  { code: 'platform.product.read', domain: 'product', description: 'Consulter catalogue produit' },
  { code: 'platform.product.manage', domain: 'product', description: 'Gérer paramètres produit non sensibles' },
  { code: 'platform.ops.metrics', domain: 'ops', description: 'Métriques d’exploitation' },
  { code: 'platform.ops.jobs', domain: 'ops', description: 'Files et tâches planifiées' },
  { code: 'platform.ops.diagnostics', domain: 'ops', description: 'Diagnostics (données masquées)' },
  { code: 'platform.ops.backups', domain: 'ops', description: 'Sauvegardes / restauration (procédure)' },
  { code: 'platform.security.read', domain: 'security', description: 'Consulter alertes et posture sécurité' },
  { code: 'platform.security.manage', domain: 'security', description: 'Piloter politiques sécurité' },
  { code: 'platform.security.incident', domain: 'security', description: 'Gérer incidents de sécurité' },
  { code: 'platform.compliance.read', domain: 'compliance', description: 'Lire RoPA / conformité' },
  { code: 'platform.compliance.manage', domain: 'compliance', description: 'Tenir registre et demandes DCP' },
  { code: 'platform.audit.read', domain: 'audit', description: 'Consulter journaux d’audit' },
  { code: 'platform.audit.export', domain: 'audit', description: 'Exporter preuves d’audit' },
  { code: 'platform.commercial.read', domain: 'commercial', description: 'Consulter opportunités / comptes' },
  { code: 'platform.commercial.manage', domain: 'commercial', description: 'Gérer pipeline commercial' },
  { code: 'platform.partners.read', domain: 'commercial', description: 'Consulter partenaires' },
  { code: 'platform.partners.manage', domain: 'commercial', description: 'Administrer partenaires' },
  { code: 'platform.billing.read', domain: 'billing', description: 'Consulter abonnements / factures SaaS' },
  { code: 'platform.billing.manage', domain: 'billing', description: 'Configurer plans et facturation' },
  { code: 'platform.billing.dunning', domain: 'billing', description: 'Relances / dunning' },
  { code: 'platform.payments.read', domain: 'payments', description: 'Consulter transactions' },
  { code: 'platform.payments.reconcile', domain: 'payments', description: 'Rapprochements monétiques' },
  { code: 'platform.refunds.request', domain: 'payments', description: 'Initier une demande de remboursement' },
  { code: 'platform.refunds.approve', domain: 'payments', description: 'Approuver / rejeter un remboursement' },
  { code: 'platform.fraud.read', domain: 'payments', description: 'Alertes fraude (données minimisées)' },
  { code: 'platform.support.tickets', domain: 'support', description: 'Traiter tickets support' },
  { code: 'platform.support.impersonate', domain: 'support', description: 'Impersonation time-boxed' },
  { code: 'platform.support.contact_inbox', domain: 'support', description: 'Boîte contact publique' },
  { code: 'platform.comms.campaigns', domain: 'content', description: 'Campagnes de communication plateforme' },
  { code: 'platform.content.manage', domain: 'content', description: 'Contenu public / aide' },
  { code: 'platform.analytics.read', domain: 'data', description: 'Analytics et KPIs agrégés' },
  { code: 'platform.data.steward', domain: 'data', description: 'Qualité / dictionnaire de données' },
  { code: 'platform.refs.manage', domain: 'data', description: 'Référentiels institutionnels partagés' },
  { code: 'platform.integrations.manage', domain: 'integrations', description: 'Clients API / webhooks' },
  { code: 'platform.integrations.desps', domain: 'integrations', description: 'Connecteur DESPS / DSC' },
  { code: 'platform.country.scope', domain: 'governance', description: 'Limiter l’action à un pays / zone' },
] as const;

export const PLATFORM_PERMISSION_CODES: readonly PlatformPermissionCode[] = PLATFORM_PERMISSIONS.map(
  (p) => p.code
);

export const isPlatformPermissionCode = (value: string): value is PlatformPermissionCode =>
  (PLATFORM_PERMISSION_CODES as readonly string[]).includes(value);

/** Mapping legacy scopes soft → permissions (compat `requirePlatformPerm`). */
export const SCOPE_TO_PERMISSIONS = {
  support: [
    'platform.support.tickets',
    'platform.support.impersonate',
    'platform.support.contact_inbox',
    'platform.users.reset_mfa',
    'platform.users.reset_password',
  ],
  billing: ['platform.billing.read', 'platform.billing.manage', 'platform.billing.dunning'],
  security: [
    'platform.security.read',
    'platform.security.manage',
    'platform.tenants.freeze',
    'platform.compliance.read',
  ],
  ops: ['platform.ops.metrics', 'platform.ops.jobs', 'platform.ops.diagnostics', 'platform.settings.read'],
} as const satisfies Record<string, readonly PlatformPermissionCode[]>;
