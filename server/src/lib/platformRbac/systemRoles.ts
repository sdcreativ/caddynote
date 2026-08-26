/**
 * Rôles système d’administration de la plateforme CaddyNote (éditeur SDCREATIV)
 * + matrice de permissions.
 * @see docs/CaddyNote_Roles_Administration_Plateforme_SDCREATIV.docx.md
 */

import type { PlatformPermissionCode } from './catalog.js';
import { PLATFORM_PERMISSION_CODES } from './catalog.js';

export type PlatformSystemRoleCode =
  | 'platform_owner'
  | 'super_admin'
  | 'ops_director'
  | 'country_manager'
  | 'product_manager'
  | 'app_admin'
  | 'devops'
  | 'dba'
  | 'integrations_admin'
  | 'ciso'
  | 'dpo'
  | 'legal'
  | 'auditor'
  | 'security_incident'
  | 'sales_admin'
  | 'account_manager'
  | 'customer_success'
  | 'onboarding'
  | 'partner_manager'
  | 'billing_admin'
  | 'accountant_platform'
  | 'payments_ops'
  | 'refund_approver'
  | 'fraud_analyst'
  | 'support_l1'
  | 'support_l2'
  | 'support_lead'
  | 'content_manager'
  | 'qa_lead'
  | 'trainer'
  | 'data_steward'
  | 'bi_analyst'
  | 'ref_admin'
  | 'desps_admin';

export type PlatformSystemRoleDef = {
  code: PlatformSystemRoleCode;
  label: string;
  level: 0 | 1 | 2 | 3 | 4;
  description: string;
  permissions: readonly PlatformPermissionCode[];
};

const ALL = PLATFORM_PERMISSION_CODES;

const uniq = (codes: readonly PlatformPermissionCode[]): PlatformPermissionCode[] => [
  ...new Set(codes),
];

const consoleBase: PlatformPermissionCode[] = ['platform.console.access'];

export const PLATFORM_SYSTEM_ROLES: readonly PlatformSystemRoleDef[] = [
  {
    code: 'platform_owner',
    label: 'Propriétaire de la plateforme',
    level: 0,
    description: 'Gouvernance stratégique de CaddyNote au nom de l’éditeur SDCREATIV — pas d’ops quotidiennes.',
    permissions: uniq([
      ...consoleBase,
      'platform.governance.read',
      'platform.governance.approve',
      'platform.rbac.read',
      'platform.rbac.manage',
      'platform.rbac.promote_super_admin',
      'platform.audit.read',
      'platform.analytics.read',
      'platform.billing.read',
    ]),
  },
  {
    code: 'super_admin',
    label: 'Super administrateur plateforme',
    level: 0,
    description: 'Configuration critique globale. Deux maximum au démarrage.',
    permissions: ALL,
  },
  {
    code: 'ops_director',
    label: 'Directeur des opérations plateforme',
    level: 1,
    description: 'Pilotage exploitation, SLA, coordination des équipes.',
    permissions: uniq([
      ...consoleBase,
      'platform.governance.read',
      'platform.tenants.read',
      'platform.tenants.onboard',
      'platform.ops.metrics',
      'platform.support.tickets',
      'platform.analytics.read',
      'platform.billing.read',
      'platform.security.read',
      'platform.audit.read',
    ]),
  },
  {
    code: 'country_manager',
    label: 'Responsable pays / zone',
    level: 1,
    description: 'Périmètre national ou zone commerciale.',
    permissions: uniq([
      ...consoleBase,
      'platform.country.scope',
      'platform.tenants.read',
      'platform.analytics.read',
      'platform.billing.read',
      'platform.commercial.read',
      'platform.support.tickets',
    ]),
  },
  {
    code: 'product_manager',
    label: 'Responsable produit',
    level: 2,
    description: 'Catalogue fonctionnel et paramètres produit non sensibles.',
    permissions: uniq([
      ...consoleBase,
      'platform.product.read',
      'platform.product.manage',
      'platform.feature_flags.manage',
      'platform.analytics.read',
    ]),
  },
  {
    code: 'app_admin',
    label: 'Administrateur technique applicatif',
    level: 2,
    description: 'Paramètres applicatifs, flags, files, diagnostics masqués.',
    permissions: uniq([
      ...consoleBase,
      'platform.settings.read',
      'platform.settings.manage',
      'platform.feature_flags.manage',
      'platform.ops.jobs',
      'platform.ops.diagnostics',
      'platform.ops.metrics',
    ]),
  },
  {
    code: 'devops',
    label: 'Ingénieur DevOps / SRE',
    level: 2,
    description: 'Disponibilité, sauvegardes, observabilité — pas de finance.',
    permissions: uniq([
      ...consoleBase,
      'platform.ops.metrics',
      'platform.ops.diagnostics',
      'platform.ops.backups',
      'platform.ops.jobs',
    ]),
  },
  {
    code: 'dba',
    label: 'Administrateur base de données',
    level: 2,
    description: 'Maintenance / restauration DB — accès nominatif temporaire.',
    permissions: uniq([...consoleBase, 'platform.ops.backups', 'platform.ops.diagnostics']),
  },
  {
    code: 'integrations_admin',
    label: 'Responsable intégrations et API',
    level: 2,
    description: 'Clients API, scopes, quotas, webhooks.',
    permissions: uniq([
      ...consoleBase,
      'platform.integrations.manage',
      'platform.ops.metrics',
      'platform.partners.read',
    ]),
  },
  {
    code: 'ciso',
    label: 'Responsable sécurité — RSSI',
    level: 2,
    description: 'Politique sécurité, risques, revues d’accès.',
    permissions: uniq([
      ...consoleBase,
      'platform.security.read',
      'platform.security.manage',
      'platform.tenants.freeze',
      'platform.audit.read',
      'platform.rbac.read',
      'platform.compliance.read',
    ]),
  },
  {
    code: 'dpo',
    label: 'Protection des données / DCP',
    level: 2,
    description: 'Registre des traitements, droits des personnes, ARTCI.',
    permissions: uniq([
      ...consoleBase,
      'platform.compliance.read',
      'platform.compliance.manage',
      'platform.audit.read',
      'platform.users.read',
    ]),
  },
  {
    code: 'legal',
    label: 'Responsable juridique et conformité',
    level: 2,
    description: 'CGU, contrats, obligations réglementaires.',
    permissions: uniq([
      ...consoleBase,
      'platform.compliance.read',
      'platform.commercial.read',
      'platform.audit.read',
    ]),
  },
  {
    code: 'auditor',
    label: 'Auditeur interne — lecture seule',
    level: 4,
    description: 'Consultation audit / conformité sans mutation.',
    permissions: uniq([
      ...consoleBase,
      'platform.audit.read',
      'platform.audit.export',
      'platform.compliance.read',
      'platform.security.read',
      'platform.analytics.read',
      'platform.billing.read',
    ]),
  },
  {
    code: 'security_incident',
    label: 'Gestionnaire des incidents de sécurité',
    level: 2,
    description: 'Cellule de crise, confinement, preuves.',
    permissions: uniq([
      ...consoleBase,
      'platform.security.read',
      'platform.security.incident',
      'platform.tenants.freeze',
      'platform.audit.read',
      'platform.ops.diagnostics',
    ]),
  },
  {
    code: 'sales_admin',
    label: 'Administrateur commercial',
    level: 3,
    description: 'Opportunités et devis — pas d’activation tenant ni paiements.',
    permissions: uniq([...consoleBase, 'platform.commercial.read', 'platform.commercial.manage']),
  },
  {
    code: 'account_manager',
    label: 'Gestionnaire de comptes',
    level: 3,
    description: 'Relation contractuelle établissements.',
    permissions: uniq([
      ...consoleBase,
      'platform.commercial.read',
      'platform.tenants.read',
      'platform.billing.read',
      'platform.analytics.read',
    ]),
  },
  {
    code: 'customer_success',
    label: 'Responsable Customer Success',
    level: 3,
    description: 'Adoption, satisfaction, risque de résiliation.',
    permissions: uniq([
      ...consoleBase,
      'platform.tenants.read',
      'platform.analytics.read',
      'platform.support.tickets',
      'platform.commercial.read',
    ]),
  },
  {
    code: 'onboarding',
    label: 'Responsable onboarding / déploiement',
    level: 3,
    description: 'Création tenant et administrateur initial après validation.',
    permissions: uniq([
      ...consoleBase,
      'platform.tenants.read',
      'platform.tenants.manage',
      'platform.tenants.onboard',
      'platform.users.manage',
    ]),
  },
  {
    code: 'partner_manager',
    label: 'Gestionnaire des partenaires',
    level: 3,
    description: 'Opérateurs paiement / SMS / intégrateurs — pas de secrets bancaires.',
    permissions: uniq([
      ...consoleBase,
      'platform.partners.read',
      'platform.partners.manage',
      'platform.integrations.manage',
    ]),
  },
  {
    code: 'billing_admin',
    label: 'Administrateur abonnements et facturation',
    level: 2,
    description: 'Plans, factures, échéances SaaS.',
    permissions: uniq([
      ...consoleBase,
      'platform.billing.read',
      'platform.billing.manage',
      'platform.billing.dunning',
      'platform.tenants.read',
    ]),
  },
  {
    code: 'accountant_platform',
    label: 'Comptable plateforme',
    level: 2,
    description: 'Rapprochement et états financiers — pas de permissions scolaires.',
    permissions: uniq([
      ...consoleBase,
      'platform.billing.read',
      'platform.payments.read',
      'platform.payments.reconcile',
      'platform.analytics.read',
    ]),
  },
  {
    code: 'payments_ops',
    label: 'Responsable paiements et rapprochements',
    level: 2,
    description: 'Transactions, anomalies, initiation remboursement.',
    permissions: uniq([
      ...consoleBase,
      'platform.payments.read',
      'platform.payments.reconcile',
      'platform.refunds.request',
      'platform.billing.read',
    ]),
  },
  {
    code: 'refund_approver',
    label: 'Validateur remboursements',
    level: 2,
    description: 'Approuve ou rejette — ne pas initier la même opération.',
    permissions: uniq([...consoleBase, 'platform.refunds.approve', 'platform.payments.read']),
  },
  {
    code: 'fraud_analyst',
    label: 'Analyste fraude et risque',
    level: 4,
    description: 'Alertes et vélocité — données minimisées.',
    permissions: uniq([...consoleBase, 'platform.fraud.read', 'platform.payments.read', 'platform.analytics.read']),
  },
  {
    code: 'support_l1',
    label: 'Support niveau 1',
    level: 3,
    description: 'Demandes usuelles, actions limitées.',
    permissions: uniq([
      ...consoleBase,
      'platform.support.tickets',
      'platform.support.contact_inbox',
      'platform.tenants.read',
      'platform.users.read',
    ]),
  },
  {
    code: 'support_l2',
    label: 'Support niveau 2',
    level: 3,
    description: 'Anomalies avancées, impersonation, reset MFA/mdp.',
    permissions: uniq([
      ...consoleBase,
      'platform.support.tickets',
      'platform.support.impersonate',
      'platform.support.contact_inbox',
      'platform.users.read',
      'platform.users.reset_mfa',
      'platform.users.reset_password',
      'platform.tenants.read',
      'platform.ops.diagnostics',
    ]),
  },
  {
    code: 'support_lead',
    label: 'Responsable support',
    level: 2,
    description: 'SLA, escalades, qualité des réponses.',
    permissions: uniq([
      ...consoleBase,
      'platform.support.tickets',
      'platform.support.impersonate',
      'platform.support.contact_inbox',
      'platform.users.read',
      'platform.users.reset_mfa',
      'platform.users.reset_password',
      'platform.tenants.read',
      'platform.analytics.read',
      'platform.comms.campaigns',
    ]),
  },
  {
    code: 'content_manager',
    label: 'Gestionnaire de contenu',
    level: 3,
    description: 'Pages publiques, centre d’aide, communications produit.',
    permissions: uniq([...consoleBase, 'platform.content.manage', 'platform.comms.campaigns']),
  },
  {
    code: 'qa_lead',
    label: 'Responsable qualité',
    level: 2,
    description: 'Processus, recettes, conformité des mises en production.',
    permissions: uniq([
      ...consoleBase,
      'platform.product.read',
      'platform.ops.metrics',
      'platform.audit.read',
      'platform.analytics.read',
    ]),
  },
  {
    code: 'trainer',
    label: 'Formateur CaddyNote',
    level: 3,
    description: 'Formation équipes et clients.',
    permissions: uniq([...consoleBase, 'platform.content.manage', 'platform.tenants.read', 'platform.analytics.read']),
  },
  {
    code: 'data_steward',
    label: 'Administrateur données / Data Steward',
    level: 2,
    description: 'Qualité, dictionnaire, référentiels non personnels.',
    permissions: uniq([...consoleBase, 'platform.data.steward', 'platform.refs.manage', 'platform.analytics.read']),
  },
  {
    code: 'bi_analyst',
    label: 'Analyste BI / Reporting',
    level: 4,
    description: 'Jeux agrégés / pseudonymisés uniquement.',
    permissions: uniq([...consoleBase, 'platform.analytics.read', 'platform.billing.read']),
  },
  {
    code: 'ref_admin',
    label: 'Administrateur référentiels institutionnels',
    level: 2,
    description: 'Pays, cycles, matières, nomenclatures partagées.',
    permissions: uniq([...consoleBase, 'platform.refs.manage', 'platform.product.read']),
  },
  {
    code: 'desps_admin',
    label: 'Responsable intégration DESPS / DSC',
    level: 2,
    description: 'Connecteur national — pas propriétaire des données.',
    permissions: uniq([
      ...consoleBase,
      'platform.integrations.desps',
      'platform.integrations.manage',
      'platform.ops.metrics',
    ]),
  },
];

export const PLATFORM_SYSTEM_ROLE_CODES: readonly PlatformSystemRoleCode[] = PLATFORM_SYSTEM_ROLES.map(
  (r) => r.code
);

export const isPlatformSystemRoleCode = (value: string): value is PlatformSystemRoleCode =>
  (PLATFORM_SYSTEM_ROLE_CODES as readonly string[]).includes(value);

export const getSystemRoleDef = (code: string): PlatformSystemRoleDef | undefined =>
  PLATFORM_SYSTEM_ROLES.find((r) => r.code === code);

/** Rôles pouvant gérer les habilitations. */
export const RBAC_MANAGER_ROLES: readonly PlatformSystemRoleCode[] = ['platform_owner', 'super_admin'];

/** Plafond super_admin (doc : 2 au démarrage). Surchargeable via env. */
export const getSuperAdminMaxCount = (): number => {
  const raw = process.env.PLATFORM_SUPER_ADMIN_MAX;
  const n = raw ? Number.parseInt(raw, 10) : 2;
  return Number.isFinite(n) && n > 0 ? n : 2;
};

/** Mapping ACL soft historique → rôle système. */
export const LEGACY_SCOPE_TO_ROLE = {
  support: 'support_l2',
  billing: 'billing_admin',
  security: 'ciso',
  ops: 'app_admin',
} as const satisfies Record<string, PlatformSystemRoleCode>;

/** Permissions requises pour afficher une section Super Admin. */
export const SECTION_REQUIRED_PERMISSION: Record<string, PlatformPermissionCode> = {
  overview: 'platform.console.access',
  users: 'platform.users.read',
  'advanced-users': 'platform.users.manage',
  institutions: 'platform.tenants.read',
  teachers: 'platform.users.read',
  students: 'platform.users.read',
  classes: 'platform.tenants.read',
  system: 'platform.ops.diagnostics',
  logs: 'platform.audit.read',
  observability: 'platform.ops.metrics',
  analytics: 'platform.analytics.read',
  'business-kpis': 'platform.analytics.read',
  security: 'platform.security.read',
  'security-compliance': 'platform.compliance.read',
  subscriptions: 'platform.billing.read',
  'communication-tools': 'platform.comms.campaigns',
  'support-ops': 'platform.support.tickets',
  notifications: 'platform.billing.read',
  settings: 'platform.settings.read',
  habilitations: 'platform.rbac.read',
};
