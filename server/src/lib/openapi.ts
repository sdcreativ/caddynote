/**
 * Chap. 22.2 / Lot 12 — catalogue OpenAPI 3.0 de l'API réelle (Express).
 *
 * L'API n'est pas préfixée `/v1` : le frontend (`apiClient`, `VITE_API_URL`)
 * appelle déjà ces chemins tels quels, et un préfixe casserait tous les
 * clients d'un coup. La version vit dans `info.version` (et ce document),
 * pas dans l'URL.
 *
 * Les schémas de corps sont volontairement génériques (`object`) : chaque
 * route valide déjà son entrée avec Zod. Ce document est un catalogue de
 * surface (méthode, chemin, auth, rôle), pas un SDK typé champ par champ.
 * Une dérive catalogue ↔ code se voit dans `openapi.test.ts` (plancher
 * d'opérations + chemins critiques réellement servis).
 */

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

export interface CatalogOp {
  method: HttpMethod;
  path: string;
  tag: string;
  summary: string;
  auth: 'public' | 'bearer';
  roles?: string[];
  statuses?: number[];
}

const staff = ['admin', 'school_admin', 'teacher'] as const;
const direction = ['admin', 'school_admin'] as const;

export const OPENAPI_CATALOG: CatalogOp[] = [
  { method: 'get', path: '/health', tag: 'Système', summary: 'Sonde de disponibilité (Postgres, rôle du process, cible host:port/db)', auth: 'public' },
  { method: 'get', path: '/metrics', tag: 'Système', summary: 'Métriques process (jeton optionnel METRICS_TOKEN)', auth: 'public', statuses: [401] },
  { method: 'get', path: '/status', tag: 'Système', summary: 'Page status publique (snapshot SLO léger)', auth: 'public' },
  { method: 'get', path: '/diagnostics', tag: 'Système', summary: 'Diagnostics ops plateforme', auth: 'bearer', roles: ['admin'] },
  { method: 'get', path: '/admin/bootstrap/status', tag: 'Ops admin', summary: 'Statut bootstrap super-admin (sans secrets)', auth: 'bearer', roles: ['admin'] },
  { method: 'post', path: '/admin/bootstrap/retire', tag: 'Ops admin', summary: 'Désactiver le compte bootstrap après vrai admin', auth: 'bearer', roles: ['admin'], statuses: [200, 409] },
  { method: 'get', path: '/openapi.json', tag: 'Système', summary: 'Spécification OpenAPI 3.0 de cette API', auth: 'public' },
  { method: 'get', path: '/docs', tag: 'Système', summary: 'Interface Swagger UI (lit /openapi.json)', auth: 'public' },

  { method: 'post', path: '/auth/register', tag: 'Auth', summary: 'Créer un compte', auth: 'public', statuses: [201, 400, 429] },
  { method: 'post', path: '/auth/login', tag: 'Auth', summary: 'Connexion (peut renvoyer mfaRequired)', auth: 'public', statuses: [200, 401, 429] },
  { method: 'get', path: '/auth/sso/public-config', tag: 'Auth', summary: 'Config SSO publique (bouton login)', auth: 'public' },
  { method: 'get', path: '/auth/sso/discover', tag: 'Auth', summary: 'Découvrir SSO par domaine e-mail', auth: 'public' },
  { method: 'get', path: '/auth/sso/start', tag: 'Auth', summary: 'Démarrer OIDC (redirect IdP)', auth: 'public', statuses: [302] },
  { method: 'get', path: '/auth/sso/callback', tag: 'Auth', summary: 'Callback OIDC → redirect frontend', auth: 'public', statuses: [302] },
  { method: 'post', path: '/auth/mfa/login-verify', tag: 'Auth', summary: 'Vérifier TOTP ou code de secours après login', auth: 'public', statuses: [200, 401] },
  { method: 'post', path: '/auth/mfa/setup', tag: 'Auth', summary: 'Démarrer l’enrôlement TOTP', auth: 'bearer' },
  { method: 'post', path: '/auth/mfa/confirm', tag: 'Auth', summary: 'Confirmer l’enrôlement TOTP et recevoir les codes de secours', auth: 'bearer' },
  { method: 'post', path: '/auth/mfa/disable', tag: 'Auth', summary: 'Désactiver le MFA', auth: 'bearer' },
  { method: 'get', path: '/auth/me', tag: 'Auth', summary: 'Profil de la session courante', auth: 'bearer' },
  { method: 'post', path: '/auth/change-password', tag: 'Auth', summary: 'Changer le mot de passe (révoque les autres sessions)', auth: 'bearer' },
  { method: 'post', path: '/auth/forgot-password', tag: 'Auth', summary: 'Demander une réinitialisation', auth: 'public', statuses: [200, 429] },
  { method: 'post', path: '/auth/reset-password', tag: 'Auth', summary: 'Appliquer le jeton de réinitialisation', auth: 'public' },
  { method: 'get', path: '/auth/sessions', tag: 'Auth', summary: 'Lister les sessions (IAM-004)', auth: 'bearer' },
  { method: 'delete', path: '/auth/sessions/:id', tag: 'Auth', summary: 'Révoquer une session précise', auth: 'bearer' },
  { method: 'delete', path: '/auth/sessions', tag: 'Auth', summary: 'Révoquer toutes les autres sessions', auth: 'bearer' },
  { method: 'post', path: '/auth/logout', tag: 'Auth', summary: 'Déconnexion (révoque la session courante)', auth: 'bearer' },

  { method: 'get', path: '/institutions', tag: 'Établissements', summary: 'Lister (scopé au tenant, sauf admin global)', auth: 'bearer' },
  { method: 'get', path: '/institutions/:id', tag: 'Établissements', summary: 'Lire un établissement', auth: 'bearer' },
  { method: 'post', path: '/institutions', tag: 'Établissements', summary: 'Créer un établissement', auth: 'bearer', roles: ['admin'], statuses: [201] },
  { method: 'patch', path: '/institutions/:id', tag: 'Établissements', summary: 'Modifier un établissement', auth: 'bearer' },
  { method: 'delete', path: '/institutions/:id', tag: 'Établissements', summary: 'Supprimer un établissement', auth: 'bearer', roles: ['admin'] },
  { method: 'get', path: '/institutions/:id/quotas', tag: 'Établissements', summary: 'Usage vs plafonds du plan (SAA-003)', auth: 'bearer', roles: [...direction] },
  { method: 'get', path: '/institutions/:id/features', tag: 'Établissements', summary: 'Feature flags effectifs (plan + surcharge pilote)', auth: 'bearer' },
  { method: 'put', path: '/institutions/:id/features/:key', tag: 'Établissements', summary: 'Surcharger un flag pour un tenant/pilote', auth: 'bearer', roles: ['admin'] },
  { method: 'post', path: '/institutions/:id/freeze', tag: 'Établissements', summary: 'Geler un tenant (ops)', auth: 'bearer', roles: ['admin'] },
  { method: 'post', path: '/institutions/:id/unfreeze', tag: 'Établissements', summary: 'Dégeler un tenant', auth: 'bearer', roles: ['admin'] },
  { method: 'get', path: '/institutions/:id/health', tag: 'Établissements', summary: 'Health score établissement', auth: 'bearer', roles: ['admin'] },
  { method: 'get', path: '/institutions/:id/onboarding', tag: 'Établissements', summary: 'Checklist onboarding', auth: 'bearer', roles: ['admin'] },
  { method: 'patch', path: '/institutions/:id/onboarding', tag: 'Établissements', summary: 'Mettre à jour l’onboarding', auth: 'bearer', roles: ['admin'] },
  { method: 'post', path: '/institutions/:id/offboard/export', tag: 'Établissements', summary: 'Export bulk offboarding / DSAR', auth: 'bearer', roles: ['admin'] },
  { method: 'post', path: '/institutions/:id/offboard/anonymize', tag: 'Établissements', summary: 'Anonymiser un établissement', auth: 'bearer', roles: ['admin'] },
  { method: 'post', path: '/institutions/:id/archive-year', tag: 'Établissements', summary: 'Archiver une année scolaire', auth: 'bearer', roles: ['admin'] },
  { method: 'get', path: '/institutions/:id/sso-config', tag: 'Établissements', summary: 'Lire la config IdP SSO (secret masqué)', auth: 'bearer', roles: ['admin'] },
  { method: 'put', path: '/institutions/:id/sso-config', tag: 'Établissements', summary: 'Écrire la config IdP SSO OIDC / Azure AD', auth: 'bearer', roles: ['admin'] },

  { method: 'get', path: '/groups', tag: 'Groupes', summary: 'Lister les groupes multi-établissements (ORG-002)', auth: 'bearer' },
  { method: 'get', path: '/groups/:id', tag: 'Groupes', summary: 'Lire un groupe', auth: 'bearer' },
  { method: 'post', path: '/groups', tag: 'Groupes', summary: 'Créer un groupe', auth: 'bearer', roles: ['admin'], statuses: [201] },
  { method: 'patch', path: '/groups/:id', tag: 'Groupes', summary: 'Renommer un groupe', auth: 'bearer', roles: ['admin'] },
  { method: 'delete', path: '/groups/:id', tag: 'Groupes', summary: 'Supprimer un groupe', auth: 'bearer', roles: ['admin'] },
  { method: 'get', path: '/groups/:id/institutions', tag: 'Groupes', summary: 'Établissements rattachés (lecture consolidée)', auth: 'bearer' },
  { method: 'post', path: '/groups/:id/institutions', tag: 'Groupes', summary: 'Rattacher un établissement', auth: 'bearer', roles: ['admin'] },
  { method: 'delete', path: '/groups/:id/institutions/:institutionId', tag: 'Groupes', summary: 'Détacher un établissement', auth: 'bearer', roles: ['admin'] },
  { method: 'get', path: '/groups/:id/dashboard', tag: 'Groupes', summary: 'Tableau de bord consolidé (effectifs, pas de données opérationnelles)', auth: 'bearer' },

  { method: 'get', path: '/students', tag: 'Élèves', summary: 'Lister les élèves du tenant', auth: 'bearer', roles: [...staff] },
  { method: 'post', path: '/students/import', tag: 'Élèves', summary: 'Import CSV (quota vérifié avant la première ligne)', auth: 'bearer', roles: [...direction] },
  { method: 'get', path: '/students/:id', tag: 'Élèves', summary: 'Fiche élève (self / staff / parent lié)', auth: 'bearer' },
  { method: 'get', path: '/students/:id/guardians', tag: 'Élèves', summary: 'Responsables liés à l’élève', auth: 'bearer' },
  { method: 'get', path: '/students/:id/health', tag: 'Élèves', summary: 'Informations de santé (droit canViewHealth)', auth: 'bearer' },
  { method: 'put', path: '/students/:id/health', tag: 'Élèves', summary: 'Mettre à jour les informations de santé', auth: 'bearer' },

  { method: 'get', path: '/users', tag: 'Utilisateurs', summary: 'Lister les comptes (personnel)', auth: 'bearer', roles: [...staff] },
  { method: 'post', path: '/users/import', tag: 'Utilisateurs', summary: 'Import CSV enseignants (22.1)', auth: 'bearer', roles: ['admin', 'school_admin', 'secretary'] },
  { method: 'get', path: '/users/:id', tag: 'Utilisateurs', summary: 'Lire un compte', auth: 'bearer' },
  { method: 'post', path: '/users', tag: 'Utilisateurs', summary: 'Créer un compte (quota, mot de passe temporaire)', auth: 'bearer', roles: [...direction], statuses: [201] },
  { method: 'patch', path: '/users/:id', tag: 'Utilisateurs', summary: 'Modifier un compte (rôle, profil)', auth: 'bearer' },
  { method: 'patch', path: '/users/:id/institution', tag: 'Utilisateurs', summary: 'Réassigner l’établissement (admin global)', auth: 'bearer', roles: ['admin'] },
  { method: 'patch', path: '/users/:id/group', tag: 'Utilisateurs', summary: 'Rattacher à un groupe (admin global)', auth: 'bearer', roles: ['admin'] },
  { method: 'delete', path: '/users/:id', tag: 'Utilisateurs', summary: 'Désactiver sans suppression (PER-005)', auth: 'bearer' },
  { method: 'post', path: '/users/:id/anonymize', tag: 'Utilisateurs', summary: 'Anonymisation DSAR (admin global, irréversible)', auth: 'bearer', roles: ['admin'], statuses: [200, 400, 403, 404, 409] },
  { method: 'post', path: '/users/:id/reactivate', tag: 'Utilisateurs', summary: 'Réactiver un compte désactivé', auth: 'bearer' },

  { method: 'get', path: '/classes', tag: 'Classes', summary: 'Lister les classes', auth: 'bearer' },
  { method: 'post', path: '/classes/import', tag: 'Classes', summary: 'Import CSV classes (22.1)', auth: 'bearer', roles: ['admin', 'school_admin', 'secretary'] },
  { method: 'get', path: '/classes/:id', tag: 'Classes', summary: 'Lire une classe', auth: 'bearer' },
  { method: 'post', path: '/classes', tag: 'Classes', summary: 'Créer une classe', auth: 'bearer', roles: [...direction], statuses: [201] },
  { method: 'patch', path: '/classes/:id', tag: 'Classes', summary: 'Modifier une classe', auth: 'bearer', roles: [...direction] },
  { method: 'delete', path: '/classes/:id', tag: 'Classes', summary: 'Supprimer une classe', auth: 'bearer', roles: [...direction] },
  { method: 'patch', path: '/classes/:id/teacher', tag: 'Classes', summary: 'Assigner l’enseignant principal', auth: 'bearer', roles: [...direction] },
  { method: 'get', path: '/classes/:id/student-count', tag: 'Classes', summary: 'Effectif d’une classe', auth: 'bearer' },

  { method: 'post', path: '/subjects', tag: 'Matières', summary: 'Créer une matière', auth: 'bearer', roles: [...direction], statuses: [201] },
  { method: 'get', path: '/subjects', tag: 'Matières', summary: 'Lister les matières', auth: 'bearer' },
  { method: 'patch', path: '/subjects/:id', tag: 'Matières', summary: 'Modifier une matière', auth: 'bearer', roles: [...direction] },
  { method: 'delete', path: '/subjects/:id', tag: 'Matières', summary: 'Supprimer une matière', auth: 'bearer', roles: [...direction] },
  { method: 'post', path: '/subjects/class-subjects', tag: 'Matières', summary: 'Lier une matière à une classe', auth: 'bearer', roles: [...direction] },
  { method: 'get', path: '/subjects/class-subjects/:classId', tag: 'Matières', summary: 'Matières d’une classe', auth: 'bearer' },
  { method: 'delete', path: '/subjects/class-subjects/:classId/:subjectId', tag: 'Matières', summary: 'Délier une matière d’une classe', auth: 'bearer', roles: [...direction] },
  { method: 'post', path: '/subjects/student-classes', tag: 'Matières', summary: 'Inscrire un élève dans une classe', auth: 'bearer', roles: [...staff] },
  { method: 'delete', path: '/subjects/student-classes/:studentId/:classId', tag: 'Matières', summary: 'Retirer un élève d’une classe', auth: 'bearer', roles: [...staff] },
  { method: 'get', path: '/subjects/student-classes/by-class/:classId', tag: 'Matières', summary: 'Élèves d’une classe', auth: 'bearer' },

  { method: 'get', path: '/courses', tag: 'Cours', summary: 'Lister les cours', auth: 'bearer' },
  { method: 'get', path: '/courses/:id', tag: 'Cours', summary: 'Lire un cours', auth: 'bearer' },
  { method: 'get', path: '/courses/:id/materials', tag: 'Cours', summary: 'Lister les ressources pédagogiques (PED-002)', auth: 'bearer' },
  { method: 'post', path: '/courses/:id/materials', tag: 'Cours', summary: 'Ajouter une ressource de cours', auth: 'bearer', roles: ['admin', 'school_admin', 'teacher', 'head_teacher'], statuses: [201, 501] },
  { method: 'delete', path: '/courses/:id/materials/:materialId', tag: 'Cours', summary: 'Supprimer une ressource de cours', auth: 'bearer', roles: ['admin', 'school_admin', 'teacher', 'head_teacher'] },
  { method: 'post', path: '/courses', tag: 'Cours', summary: 'Créer un cours', auth: 'bearer', roles: [...direction], statuses: [201] },
  { method: 'patch', path: '/courses/:id', tag: 'Cours', summary: 'Modifier un cours', auth: 'bearer', roles: [...staff] },
  { method: 'delete', path: '/courses/:id', tag: 'Cours', summary: 'Supprimer un cours', auth: 'bearer', roles: [...direction] },

  { method: 'get', path: '/schedules', tag: 'Emploi du temps', summary: 'Lister les créneaux (filtré par établissement)', auth: 'bearer' },
  { method: 'post', path: '/schedules/check-conflicts', tag: 'Emploi du temps', summary: 'Prévisualiser les conflits (ACA-004)', auth: 'bearer', roles: [...direction] },
  { method: 'post', path: '/schedules', tag: 'Emploi du temps', summary: 'Créer un créneau (409 si conflit, sauf force)', auth: 'bearer', roles: [...direction], statuses: [201, 409] },
  { method: 'post', path: '/schedules/:id/duplicate', tag: 'Emploi du temps', summary: 'Dupliquer un créneau', auth: 'bearer', roles: [...direction] },
  { method: 'patch', path: '/schedules/:id', tag: 'Emploi du temps', summary: 'Modifier un créneau', auth: 'bearer', roles: [...direction], statuses: [200, 409] },
  { method: 'delete', path: '/schedules/:id', tag: 'Emploi du temps', summary: 'Supprimer un créneau', auth: 'bearer', roles: [...direction] },
  { method: 'post', path: '/schedules/:id/exceptions', tag: 'Emploi du temps', summary: 'Annuler ou remplacer une occurrence (ACA-005)', auth: 'bearer', roles: [...direction], statuses: [201] },
  { method: 'get', path: '/schedules/:id/exceptions', tag: 'Emploi du temps', summary: 'Lister les exceptions d’un créneau', auth: 'bearer' },
  { method: 'delete', path: '/schedules/exceptions/:exceptionId', tag: 'Emploi du temps', summary: 'Supprimer une exception', auth: 'bearer', roles: [...direction] },
  { method: 'get', path: '/schedules/effective', tag: 'Emploi du temps', summary: 'Occurrences effectives sur une période', auth: 'bearer' },
  { method: 'get', path: '/schedules/workload', tag: 'Emploi du temps', summary: 'Charge horaire prévue/réalisée (PER-004)', auth: 'bearer' },

  { method: 'get', path: '/grades', tag: 'Notes', summary: 'Lister (brouillons masqués aux élèves/parents)', auth: 'bearer' },
  { method: 'post', path: '/grades', tag: 'Notes', summary: 'Saisir une note (brouillon)', auth: 'bearer', roles: [...staff], statuses: [201] },
  { method: 'post', path: '/grades/bulk', tag: 'Notes', summary: 'Saisir une grille de notes', auth: 'bearer', roles: [...staff] },
  { method: 'patch', path: '/grades/:id', tag: 'Notes', summary: 'Modifier une note brouillon', auth: 'bearer', roles: [...staff] },
  { method: 'delete', path: '/grades/:id', tag: 'Notes', summary: 'Supprimer une note brouillon', auth: 'bearer', roles: [...staff] },
  { method: 'post', path: '/grades/publish', tag: 'Notes', summary: 'Publier des notes (EVA-005)', auth: 'bearer', roles: [...staff] },
  { method: 'post', path: '/grades/:id/correct', tag: 'Notes', summary: 'Corriger une note publiée (conserve l’ancienne valeur)', auth: 'bearer', roles: [...staff] },
  { method: 'post', path: '/grades/compute', tag: 'Notes', summary: 'Calculer moyennes/rangs versionnés (EVA-004)', auth: 'bearer', roles: [...direction] },
  { method: 'get', path: '/grades/computations', tag: 'Notes', summary: 'Historique des calculs versionnés', auth: 'bearer' },
  { method: 'get', path: '/grades/average', tag: 'Notes', summary: 'Moyenne d’un élève', auth: 'bearer' },

  { method: 'get', path: '/academic-periods', tag: 'Périodes', summary: 'Lister les périodes académiques', auth: 'bearer' },
  { method: 'get', path: '/academic-periods/:id', tag: 'Périodes', summary: 'Lire une période', auth: 'bearer' },
  { method: 'post', path: '/academic-periods', tag: 'Périodes', summary: 'Créer une période', auth: 'bearer', roles: [...direction], statuses: [201] },
  { method: 'patch', path: '/academic-periods/:id', tag: 'Périodes', summary: 'Modifier une période', auth: 'bearer', roles: [...direction] },
  { method: 'delete', path: '/academic-periods/:id', tag: 'Périodes', summary: 'Supprimer une période', auth: 'bearer', roles: [...direction] },

  { method: 'get', path: '/grading-scales', tag: 'Barèmes', summary: 'Lister les barèmes', auth: 'bearer' },
  { method: 'post', path: '/grading-scales', tag: 'Barèmes', summary: 'Créer un barème', auth: 'bearer', roles: [...direction], statuses: [201] },
  { method: 'patch', path: '/grading-scales/:id', tag: 'Barèmes', summary: 'Modifier un barème', auth: 'bearer', roles: [...direction] },
  { method: 'delete', path: '/grading-scales/:id', tag: 'Barèmes', summary: 'Supprimer un barème', auth: 'bearer', roles: [...direction] },

  { method: 'post', path: '/observations', tag: 'Suivi', summary: 'Créer une observation pédagogique', auth: 'bearer', roles: [...staff], statuses: [201] },
  { method: 'get', path: '/observations', tag: 'Suivi', summary: 'Lister les observations', auth: 'bearer' },
  { method: 'get', path: '/observations/timeline', tag: 'Suivi', summary: 'Dossier de suivi (observations + discipline)', auth: 'bearer' },
  { method: 'get', path: '/observations/:id', tag: 'Suivi', summary: 'Lire une observation', auth: 'bearer' },
  { method: 'patch', path: '/observations/:id', tag: 'Suivi', summary: 'Modifier une observation', auth: 'bearer', roles: [...staff] },
  { method: 'delete', path: '/observations/:id', tag: 'Suivi', summary: 'Supprimer une observation', auth: 'bearer', roles: [...staff] },

  { method: 'post', path: '/discipline/incidents', tag: 'Discipline', summary: 'Signaler un incident', auth: 'bearer', roles: [...staff], statuses: [201] },
  { method: 'get', path: '/discipline/incidents', tag: 'Discipline', summary: 'Lister les incidents', auth: 'bearer' },
  { method: 'get', path: '/discipline/incidents/:id', tag: 'Discipline', summary: 'Lire un incident', auth: 'bearer' },
  { method: 'patch', path: '/discipline/incidents/:id/status', tag: 'Discipline', summary: 'Transition d’état (direction)', auth: 'bearer', roles: [...direction] },
  { method: 'post', path: '/discipline/incidents/:id/decision', tag: 'Discipline', summary: 'Enregistrer une décision', auth: 'bearer', roles: [...direction] },
  { method: 'patch', path: '/discipline/incidents/:id/confidentiality', tag: 'Discipline', summary: 'Restreindre la visibilité (SUI-005)', auth: 'bearer', roles: [...direction] },

  { method: 'post', path: '/absences/alert-check', tag: 'Présence', summary: 'Déclencher les alertes parentales (PRS-004)', auth: 'bearer', roles: ['admin'] },
  { method: 'post', path: '/absences/threshold-check', tag: 'Présence', summary: 'Évaluer les seuils d’absentéisme (PRS-006)', auth: 'bearer', roles: ['admin'] },
  { method: 'get', path: '/absences/threshold-alerts', tag: 'Présence', summary: 'Lister les alertes de seuil', auth: 'bearer', roles: [...direction] },
  { method: 'get', path: '/absences', tag: 'Présence', summary: 'Lister les absences', auth: 'bearer' },
  { method: 'post', path: '/absences', tag: 'Présence', summary: 'Enregistrer une absence (clientId pour l’idempotence hors-ligne)', auth: 'bearer', roles: [...staff], statuses: [201] },
  { method: 'post', path: '/absences/bulk', tag: 'Présence', summary: 'Appel en masse', auth: 'bearer', roles: [...staff] },
  { method: 'get', path: '/absences/stats', tag: 'Présence', summary: 'Statistiques d’assiduité', auth: 'bearer' },
  { method: 'patch', path: '/absences/:id/justify', tag: 'Présence', summary: 'Déposer un justificatif (élève/parent)', auth: 'bearer' },
  { method: 'patch', path: '/absences/:id/review', tag: 'Présence', summary: 'Accepter ou rejeter un justificatif', auth: 'bearer', roles: [...staff] },

  { method: 'get', path: '/signatures', tag: 'Signatures', summary: 'Lister les feuilles d’émargement', auth: 'bearer' },
  { method: 'get', path: '/signatures/:id', tag: 'Signatures', summary: 'Lire une feuille', auth: 'bearer' },
  { method: 'post', path: '/signatures', tag: 'Signatures', summary: 'Créer une feuille', auth: 'bearer', roles: [...staff], statuses: [201] },
  { method: 'patch', path: '/signatures/:id/status', tag: 'Signatures', summary: 'Signer / changer le statut', auth: 'bearer' },
  { method: 'delete', path: '/signatures/:id', tag: 'Signatures', summary: 'Supprimer une feuille', auth: 'bearer', roles: [...direction] },

  { method: 'post', path: '/assignments/reminder-check', tag: 'Devoirs', summary: 'Déclencher les rappels (PED-005)', auth: 'bearer', roles: ['admin'] },
  { method: 'get', path: '/assignments', tag: 'Devoirs', summary: 'Lister les devoirs', auth: 'bearer' },
  { method: 'get', path: '/assignments/:id', tag: 'Devoirs', summary: 'Lire un devoir', auth: 'bearer' },
  { method: 'post', path: '/assignments', tag: 'Devoirs', summary: 'Créer un devoir', auth: 'bearer', roles: [...staff], statuses: [201] },
  { method: 'patch', path: '/assignments/:id', tag: 'Devoirs', summary: 'Modifier un devoir', auth: 'bearer', roles: [...staff] },
  { method: 'delete', path: '/assignments/:id', tag: 'Devoirs', summary: 'Supprimer un devoir', auth: 'bearer', roles: [...staff] },
  { method: 'get', path: '/assignments/:assignmentId/submissions', tag: 'Devoirs', summary: 'Copies rendues', auth: 'bearer', roles: [...staff] },
  { method: 'get', path: '/assignments/:assignmentId/follow-up', tag: 'Devoirs', summary: 'Suivi de remise (roster + statuts, PED-004)', auth: 'bearer', roles: ['admin', 'school_admin', 'teacher', 'head_teacher'] },
  { method: 'post', path: '/assignments/submissions', tag: 'Devoirs', summary: 'Rendre un devoir', auth: 'bearer', statuses: [201] },
  { method: 'patch', path: '/assignments/submissions/:id', tag: 'Devoirs', summary: 'Modifier une copie', auth: 'bearer', roles: [...staff] },
  { method: 'patch', path: '/assignments/submissions/:id/grade', tag: 'Devoirs', summary: 'Noter une copie', auth: 'bearer', roles: [...staff] },

  { method: 'post', path: '/teacher-availability', tag: 'Disponibilités', summary: 'Déclarer une indisponibilité (PER-003)', auth: 'bearer', roles: [...staff], statuses: [201] },
  { method: 'get', path: '/teacher-availability', tag: 'Disponibilités', summary: 'Lister les indisponibilités', auth: 'bearer' },
  { method: 'patch', path: '/teacher-availability/:id/status', tag: 'Disponibilités', summary: 'Valider ou refuser une déclaration', auth: 'bearer', roles: [...direction] },
  { method: 'get', path: '/teacher-availability/:id/conflicts', tag: 'Disponibilités', summary: 'Créneaux planifiés impactés', auth: 'bearer' },

  { method: 'get', path: '/messages/received', tag: 'Messagerie', summary: 'Messages reçus', auth: 'bearer' },
  { method: 'get', path: '/messages/sent', tag: 'Messagerie', summary: 'Messages envoyés', auth: 'bearer' },
  { method: 'post', path: '/messages', tag: 'Messagerie', summary: 'Envoyer un message interne', auth: 'bearer', statuses: [201] },
  { method: 'patch', path: '/messages/:id/read', tag: 'Messagerie', summary: 'Marquer comme lu', auth: 'bearer' },
  { method: 'post', path: '/messages/:id/reply', tag: 'Messagerie', summary: 'Répondre', auth: 'bearer' },
  { method: 'get', path: '/messages/contacts', tag: 'Messagerie', summary: 'Annuaire (filtré par établissement)', auth: 'bearer' },

  { method: 'get', path: '/notifications', tag: 'Notifications', summary: 'Lister les notifications', auth: 'bearer' },
  { method: 'post', path: '/notifications', tag: 'Notifications', summary: 'Créer une notification', auth: 'bearer', roles: [...staff], statuses: [201] },
  { method: 'patch', path: '/notifications/:id/read', tag: 'Notifications', summary: 'Marquer une notification comme lue', auth: 'bearer' },
  { method: 'patch', path: '/notifications/read-all', tag: 'Notifications', summary: 'Tout marquer comme lu', auth: 'bearer' },
  { method: 'delete', path: '/notifications/:id', tag: 'Notifications', summary: 'Supprimer une notification', auth: 'bearer' },

  { method: 'get', path: '/settings', tag: 'Réglages', summary: 'Lister les réglages', auth: 'bearer' },
  { method: 'get', path: '/settings/:category', tag: 'Réglages', summary: 'Réglages d’une catégorie', auth: 'bearer' },
  { method: 'get', path: '/settings/:category/:key', tag: 'Réglages', summary: 'Lire une clé', auth: 'bearer' },
  { method: 'put', path: '/settings/:category/:key', tag: 'Réglages', summary: 'Écrire une clé', auth: 'bearer' },
  { method: 'delete', path: '/settings/:category/:key', tag: 'Réglages', summary: 'Supprimer une clé', auth: 'bearer' },

  { method: 'get', path: '/guardians/for-student/:studentId', tag: 'Responsables', summary: 'Liens responsables d’un élève', auth: 'bearer' },
  { method: 'get', path: '/guardians/my-children', tag: 'Responsables', summary: 'Enfants du parent connecté (ELV-002)', auth: 'bearer', roles: ['parent'] },
  { method: 'get', path: '/guardians/search-by-email', tag: 'Responsables', summary: 'Rechercher un responsable existant', auth: 'bearer', roles: [...direction] },
  { method: 'post', path: '/guardians', tag: 'Responsables', summary: 'Lier un responsable à un élève', auth: 'bearer', roles: [...direction], statuses: [201] },
  { method: 'patch', path: '/guardians/:id', tag: 'Responsables', summary: 'Modifier les droits d’un lien', auth: 'bearer', roles: [...direction] },
  { method: 'patch', path: '/guardians/:id/deactivate', tag: 'Responsables', summary: 'Désactiver un lien (conserve l’historique)', auth: 'bearer', roles: [...direction] },

  { method: 'post', path: '/subscriptions/expiration-check', tag: 'Abonnement', summary: 'Tâche d’expiration (admin global)', auth: 'bearer', roles: ['admin'] },
  { method: 'get', path: '/subscriptions/all', tag: 'Abonnement', summary: 'Tous les abonnements SaaS', auth: 'bearer', roles: ['admin'] },
  { method: 'get', path: '/subscriptions/alerts', tag: 'Abonnement', summary: 'Alertes d’expiration', auth: 'bearer', roles: ['admin'] },
  { method: 'get', path: '/subscriptions/plans', tag: 'Abonnement', summary: 'Catalogue d’offres', auth: 'bearer' },
  { method: 'get', path: '/subscriptions/current', tag: 'Abonnement', summary: 'Abonnement de l’établissement courant', auth: 'bearer' },
  { method: 'get', path: '/subscriptions/notifications/unread', tag: 'Abonnement', summary: 'Notifications d’abonnement non lues', auth: 'bearer' },
  { method: 'post', path: '/subscriptions/notifications', tag: 'Abonnement', summary: 'Créer une notification d’abonnement', auth: 'bearer', statuses: [201] },
  { method: 'patch', path: '/subscriptions/notifications/:id/read', tag: 'Abonnement', summary: 'Marquer une notification comme lue', auth: 'bearer' },
  { method: 'get', path: '/subscriptions/billing-history/:subscriptionId', tag: 'Abonnement', summary: 'Historique de facturation SaaS', auth: 'bearer' },
  { method: 'get', path: '/subscriptions/counts/students', tag: 'Abonnement', summary: 'Décompte d’élèves (scopé tenant)', auth: 'bearer' },
  { method: 'get', path: '/subscriptions/counts/institutions', tag: 'Abonnement', summary: 'Décompte d’établissements', auth: 'bearer' },
  { method: 'patch', path: '/subscriptions/:id/cancel', tag: 'Abonnement', summary: 'Annuler un abonnement', auth: 'bearer' },
  { method: 'post', path: '/subscriptions/checkout-session', tag: 'Abonnement', summary: 'Session Stripe Checkout (501 si non configuré)', auth: 'bearer', statuses: [200, 501] },
  { method: 'post', path: '/subscriptions/customer-portal', tag: 'Abonnement', summary: 'Portail client Stripe (501 si non configuré)', auth: 'bearer', statuses: [200, 501] },
  { method: 'post', path: '/subscriptions/webhook', tag: 'Abonnement', summary: 'Webhook Stripe (corps brut, signature)', auth: 'public', statuses: [200, 400, 501] },

  { method: 'post', path: '/activity', tag: 'Activité', summary: 'Journal d’activité client (complémentaire, falsifiable — voir /audit-log)', auth: 'bearer', statuses: [201] },
  { method: 'get', path: '/activity', tag: 'Activité', summary: 'Lister l’activité (scopée établissement)', auth: 'bearer' },
  { method: 'get', path: '/activity/by-user/:userId', tag: 'Activité', summary: 'Activité d’un utilisateur', auth: 'bearer' },

  { method: 'get', path: '/analytics/dashboard-metrics', tag: 'Analytics', summary: 'Métriques du tableau de bord (personnel)', auth: 'bearer', roles: [...staff] },
  { method: 'post', path: '/analytics/metrics', tag: 'Analytics', summary: 'Enregistrer une métrique', auth: 'bearer', statuses: [201] },
  { method: 'get', path: '/analytics/weekly-stats', tag: 'Analytics', summary: 'Stats hebdomadaires (personnel)', auth: 'bearer', roles: [...staff] },
  { method: 'get', path: '/analytics/monthly-stats', tag: 'Analytics', summary: 'Stats mensuelles (personnel)', auth: 'bearer', roles: [...staff] },
  { method: 'get', path: '/analytics/academic-metrics', tag: 'Analytics', summary: 'Métriques académiques (personnel)', auth: 'bearer', roles: [...staff] },
  { method: 'get', path: '/analytics/institution-ranking', tag: 'Analytics', summary: 'Classement inter-établissements (admin global)', auth: 'bearer', roles: ['admin'] },
  { method: 'get', path: '/analytics/export', tag: 'Analytics', summary: 'Export analytics serveur (JSON/CSV)', auth: 'bearer', roles: ['admin', 'school_admin', 'teacher', 'head_teacher'] },

  { method: 'get', path: '/reports/export', tag: 'Rapports', summary: 'Export CSV/XLSX/PDF (élèves, absences, notes, présence)', auth: 'bearer', roles: ['admin', 'school_admin', 'teacher', 'head_teacher'] },
  { method: 'post', path: '/reports/schedule', tag: 'Rapports', summary: 'Planifier un export CSV', auth: 'bearer', roles: ['admin', 'school_admin', 'teacher', 'head_teacher'], statuses: [201] },
  { method: 'get', path: '/reports/schedule', tag: 'Rapports', summary: 'Lister les exports planifiés', auth: 'bearer', roles: ['admin', 'school_admin', 'teacher', 'head_teacher'] },
  { method: 'post', path: '/reports/schedule/run', tag: 'Rapports', summary: 'Exécuter la file d’exports dus (ops/tests)', auth: 'bearer', roles: ['admin', 'school_admin'] },
  { method: 'get', path: '/reports/:id/download', tag: 'Rapports', summary: 'Télécharger le CSV d’un rapport planifié', auth: 'bearer', roles: ['admin', 'school_admin', 'teacher', 'head_teacher'] },
  { method: 'post', path: '/reports', tag: 'Rapports', summary: 'Créer un ticket de rapport', auth: 'bearer', roles: [...direction], statuses: [201] },
  { method: 'get', path: '/reports', tag: 'Rapports', summary: 'Lister les tickets', auth: 'bearer' },
  { method: 'get', path: '/reports/:id', tag: 'Rapports', summary: 'Lire un ticket', auth: 'bearer' },
  { method: 'patch', path: '/reports/:id/status', tag: 'Rapports', summary: 'Mettre à jour le statut', auth: 'bearer', roles: [...direction] },
  { method: 'delete', path: '/reports/:id', tag: 'Rapports', summary: 'Supprimer un ticket', auth: 'bearer', roles: [...direction] },

  { method: 'post', path: '/exercises/ai/generate', tag: 'Exercices', summary: 'Générer un exercice (Claude, 501 si non configuré)', auth: 'bearer', roles: [...staff], statuses: [200, 403, 501] },
  { method: 'post', path: '/exercises/ai/correct-answer', tag: 'Exercices', summary: 'Correction assistée', auth: 'bearer', statuses: [200, 501] },
  { method: 'post', path: '/exercises/ai/adaptive-recommendations', tag: 'Exercices', summary: 'Recommandations adaptatives', auth: 'bearer', statuses: [200, 501] },
  { method: 'post', path: '/exercises/ai/pedagogical-help', tag: 'Exercices', summary: 'Aide pédagogique', auth: 'bearer', statuses: [200, 501] },
  { method: 'get', path: '/exercises', tag: 'Exercices', summary: 'Lister les exercices', auth: 'bearer' },
  { method: 'get', path: '/exercises/:id', tag: 'Exercices', summary: 'Lire un exercice', auth: 'bearer' },
  { method: 'post', path: '/exercises', tag: 'Exercices', summary: 'Créer un exercice', auth: 'bearer', roles: [...staff], statuses: [201] },
  { method: 'patch', path: '/exercises/:id', tag: 'Exercices', summary: 'Modifier un exercice', auth: 'bearer', roles: [...staff] },
  { method: 'delete', path: '/exercises/:id', tag: 'Exercices', summary: 'Supprimer un exercice', auth: 'bearer', roles: [...staff] },
  { method: 'get', path: '/exercises/:id/questions', tag: 'Exercices', summary: 'Questions d’un exercice', auth: 'bearer' },
  { method: 'post', path: '/exercises/:id/questions', tag: 'Exercices', summary: 'Ajouter une question', auth: 'bearer', roles: [...staff], statuses: [201] },
  { method: 'patch', path: '/exercises/questions/:questionId', tag: 'Exercices', summary: 'Modifier une question', auth: 'bearer', roles: [...staff] },
  { method: 'delete', path: '/exercises/questions/:questionId', tag: 'Exercices', summary: 'Supprimer une question', auth: 'bearer', roles: [...staff] },
  { method: 'get', path: '/exercises/:id/assignments', tag: 'Exercices', summary: 'Assignations d’un exercice', auth: 'bearer' },
  { method: 'post', path: '/exercises/:id/assignments', tag: 'Exercices', summary: 'Assigner un exercice', auth: 'bearer', roles: [...staff], statuses: [201] },
  { method: 'delete', path: '/exercises/assignments/:assignmentId', tag: 'Exercices', summary: 'Retirer une assignation', auth: 'bearer', roles: [...staff] },
  { method: 'get', path: '/exercises/:id/progress', tag: 'Exercices', summary: 'Progression', auth: 'bearer' },
  { method: 'patch', path: '/exercises/:id/progress', tag: 'Exercices', summary: 'Mettre à jour la progression', auth: 'bearer' },
  { method: 'get', path: '/exercises/:id/attempts', tag: 'Exercices', summary: 'Tentatives', auth: 'bearer' },
  { method: 'post', path: '/exercises/:id/attempts', tag: 'Exercices', summary: 'Démarrer une tentative', auth: 'bearer', statuses: [201] },
  { method: 'patch', path: '/exercises/attempts/:attemptId', tag: 'Exercices', summary: 'Soumettre une tentative', auth: 'bearer' },

  { method: 'post', path: '/files/presign-upload', tag: 'Fichiers', summary: 'POST signé S3 (MIME/taille imposés, 501 si S3 absent)', auth: 'bearer', statuses: [200, 501] },
  { method: 'post', path: '/files/presign-download', tag: 'Fichiers', summary: 'URL de téléchargement signée (jamais public)', auth: 'bearer', statuses: [200, 501] },

  { method: 'post', path: '/finance/late-fee-check', tag: 'Finance', summary: 'Déclencher les pénalités de retard', auth: 'bearer', roles: ['admin'] },
  { method: 'get', path: '/finance/fee-items', tag: 'Finance', summary: 'Catalogue de frais', auth: 'bearer' },
  { method: 'post', path: '/finance/fee-items', tag: 'Finance', summary: 'Créer un frais', auth: 'bearer', roles: [...direction], statuses: [201] },
  { method: 'patch', path: '/finance/fee-items/:id', tag: 'Finance', summary: 'Modifier un frais', auth: 'bearer', roles: [...direction] },
  { method: 'delete', path: '/finance/fee-items/:id', tag: 'Finance', summary: 'Supprimer un frais', auth: 'bearer', roles: [...direction] },
  { method: 'get', path: '/finance/invoices', tag: 'Finance', summary: 'Lister les factures', auth: 'bearer' },
  { method: 'get', path: '/finance/invoices/:id', tag: 'Finance', summary: 'Lire une facture', auth: 'bearer' },
  { method: 'post', path: '/finance/invoices', tag: 'Finance', summary: 'Émettre une facture', auth: 'bearer', roles: [...direction], statuses: [201] },
  { method: 'patch', path: '/finance/invoices/:id/cancel', tag: 'Finance', summary: 'Annuler une facture', auth: 'bearer', roles: [...direction] },
  { method: 'post', path: '/finance/invoices/:id/payments/cinetpay/initiate', tag: 'Finance', summary: 'Paiement Mobile Money (501 si non configuré)', auth: 'bearer', statuses: [200, 501] },
  { method: 'post', path: '/finance/invoices/:id/payments/stripe/initiate', tag: 'Finance', summary: 'Paiement carte (501 si non configuré)', auth: 'bearer', statuses: [200, 501] },
  { method: 'post', path: '/finance/invoices/:id/payments/manual', tag: 'Finance', summary: 'Enregistrer un virement/espèces', auth: 'bearer', roles: [...direction], statuses: [201] },
  { method: 'post', path: '/finance/webhooks/cinetpay', tag: 'Finance', summary: 'Webhook CinetPay (public ; confirmation via check serveur FIN-005)', auth: 'public', statuses: [200, 400, 500] },
  { method: 'post', path: '/finance/payments/:id/refund', tag: 'Finance', summary: 'Rembourser sans supprimer le paiement', auth: 'bearer', roles: [...direction] },
  { method: 'post', path: '/finance/bank-statement/import', tag: 'Finance', summary: 'Importer un relevé bancaire', auth: 'bearer', roles: [...direction] },
  { method: 'get', path: '/finance/bank-statement/lines', tag: 'Finance', summary: 'Lignes de relevé', auth: 'bearer', roles: [...direction] },
  { method: 'post', path: '/finance/bank-statement/lines/:id/auto-match', tag: 'Finance', summary: 'Rapprochement auto (candidat unique)', auth: 'bearer', roles: [...direction] },
  { method: 'post', path: '/finance/bank-statement/lines/:id/match', tag: 'Finance', summary: 'Rapprochement manuel', auth: 'bearer', roles: [...direction] },
  { method: 'delete', path: '/finance/bank-statement/lines/:id/match', tag: 'Finance', summary: 'Annuler un rapprochement', auth: 'bearer', roles: [...direction] },
  { method: 'post', path: '/finance/bank-statement/lines/:id/ignore', tag: 'Finance', summary: 'Ignorer une ligne', auth: 'bearer', roles: [...direction] },
  { method: 'get', path: '/finance/bank-statement/summary', tag: 'Finance', summary: 'Bilan de rapprochement', auth: 'bearer', roles: [...direction] },
  { method: 'get', path: '/finance/verify/:token', tag: 'Finance', summary: 'Vérification publique d’un reçu (QR)', auth: 'public' },

  { method: 'get', path: '/communications/preferences', tag: 'Communication', summary: 'Préférences par canal', auth: 'bearer' },
  { method: 'put', path: '/communications/preferences/:channel', tag: 'Communication', summary: 'Opt-in / opt-out d’un canal', auth: 'bearer' },
  { method: 'get', path: '/communications/templates', tag: 'Communication', summary: 'Modèles versionnés', auth: 'bearer' },
  { method: 'post', path: '/communications/templates', tag: 'Communication', summary: 'Créer une nouvelle version de modèle', auth: 'bearer', roles: [...direction], statuses: [201] },
  { method: 'delete', path: '/communications/templates/:id', tag: 'Communication', summary: 'Désactiver un modèle', auth: 'bearer', roles: [...direction] },
  { method: 'post', path: '/communications/send', tag: 'Communication', summary: 'Envoyer (202 + file pour e-mail/SMS/WhatsApp)', auth: 'bearer', roles: [...staff], statuses: [202] },
  { method: 'get', path: '/communications/logs', tag: 'Communication', summary: 'Journal d’envoi', auth: 'bearer' },
  { method: 'get', path: '/communications/logs/:id', tag: 'Communication', summary: 'Détail d’un envoi', auth: 'bearer' },
  { method: 'post', path: '/communications/logs/:id/acknowledge', tag: 'Communication', summary: 'Accusé de réception (critique)', auth: 'bearer' },
  { method: 'post', path: '/communications/webhooks/twilio', tag: 'Communication', summary: 'Webhook Twilio signé (SMS/WhatsApp)', auth: 'public' },

  { method: 'post', path: '/documents/enrollment-certificate', tag: 'Documents', summary: 'Certificat de scolarité PDF + QR', auth: 'bearer', roles: [...direction], statuses: [201] },
  { method: 'post', path: '/documents/payment-receipt', tag: 'Documents', summary: 'Reçu de paiement PDF + QR', auth: 'bearer', roles: [...direction], statuses: [201] },
  { method: 'post', path: '/documents/report-card', tag: 'Documents', summary: 'Bulletin PDF (dernier calcul versionné)', auth: 'bearer', roles: [...direction], statuses: [201] },
  { method: 'post', path: '/documents/transcript', tag: 'Documents', summary: 'Relevé de notes PDF', auth: 'bearer', roles: [...direction], statuses: [201] },
  { method: 'post', path: '/documents/class-list', tag: 'Documents', summary: 'Liste de classe PDF', auth: 'bearer', roles: [...direction], statuses: [201] },
  { method: 'post', path: '/documents/student-card', tag: 'Documents', summary: 'Carte d’élève PDF', auth: 'bearer', roles: [...direction], statuses: [201] },
  { method: 'get', path: '/documents/templates/:type', tag: 'Documents', summary: 'Modèle d’établissement', auth: 'bearer', roles: [...direction] },
  { method: 'put', path: '/documents/templates/:type', tag: 'Documents', summary: 'Personnaliser un modèle', auth: 'bearer', roles: [...direction] },
  { method: 'post', path: '/documents/templates/:type/preview', tag: 'Documents', summary: 'Aperçu avant validation', auth: 'bearer', roles: [...direction] },
  { method: 'get', path: '/documents', tag: 'Documents', summary: 'Lister les documents générés', auth: 'bearer', roles: [...staff] },
  { method: 'get', path: '/documents/:id', tag: 'Documents', summary: 'Métadonnées d’un document', auth: 'bearer' },
  { method: 'get', path: '/documents/:id/versions', tag: 'Documents', summary: 'Historique de versions (jamais d’écrasement)', auth: 'bearer' },
  { method: 'get', path: '/documents/:id/download', tag: 'Documents', summary: 'Télécharger le PDF (URL signée ou régénération)', auth: 'bearer' },
  { method: 'post', path: '/documents/:id/revoke', tag: 'Documents', summary: 'Révoquer un document', auth: 'bearer', roles: [...direction] },
  { method: 'get', path: '/documents/verify/:token', tag: 'Documents', summary: 'Vérification publique par QR', auth: 'public' },

  { method: 'get', path: '/admissions/institutions', tag: 'Admissions', summary: 'Établissements ouverts à la préinscription', auth: 'public' },
  { method: 'get', path: '/admissions/institutions/:id/classes', tag: 'Admissions', summary: 'Classes d’un établissement (dépôt public)', auth: 'public' },
  { method: 'post', path: '/admissions', tag: 'Admissions', summary: 'Déposer un dossier sans compte', auth: 'public', statuses: [201, 429] },
  { method: 'get', path: '/admissions/status/:token', tag: 'Admissions', summary: 'Suivi public d’un dossier', auth: 'public' },
  { method: 'patch', path: '/admissions/status/:token', tag: 'Admissions', summary: 'Compléter un dossier public', auth: 'public' },
  { method: 'post', path: '/admissions/status/:token/submit', tag: 'Admissions', summary: 'Soumettre un dossier public', auth: 'public' },
  { method: 'post', path: '/admissions/status/:token/documents/presign-upload', tag: 'Admissions', summary: 'Upload pièce jointe (501 si S3 absent)', auth: 'public', statuses: [200, 501] },
  { method: 'post', path: '/admissions/status/:token/documents', tag: 'Admissions', summary: 'Rattacher une pièce au dossier', auth: 'public' },
  { method: 'post', path: '/admissions/status/:token/pay/cinetpay', tag: 'Admissions', summary: 'Payer frais de dossier (CinetPay, 501 si non configuré)', auth: 'public', statuses: [200, 400, 404, 501, 502] },
  { method: 'post', path: '/admissions/status/:token/pay/stripe', tag: 'Admissions', summary: 'Payer frais de dossier (Stripe Checkout, 501 si non configuré)', auth: 'public', statuses: [200, 400, 404, 501] },
  { method: 'get', path: '/admissions', tag: 'Admissions', summary: 'File des dossiers (direction)', auth: 'bearer', roles: [...direction] },
  { method: 'get', path: '/admissions/:id', tag: 'Admissions', summary: 'Lire un dossier', auth: 'bearer', roles: [...direction] },
  { method: 'patch', path: '/admissions/:id/status', tag: 'Admissions', summary: 'Transition d’état (machine à états serveur)', auth: 'bearer', roles: [...direction] },
  { method: 'post', path: '/admissions/:id/fee', tag: 'Admissions', summary: 'Enregistrer les frais de dossier', auth: 'bearer', roles: [...direction] },
  { method: 'post', path: '/admissions/:id/confirm-fee', tag: 'Admissions', summary: 'Confirmer le paiement des frais de dossier', auth: 'bearer', roles: [...direction] },
  { method: 'post', path: '/admissions/:id/enroll', tag: 'Admissions', summary: 'Inscrire (crée les comptes élève/responsables)', auth: 'bearer', roles: [...direction] },
  { method: 'post', path: '/admissions/:id/reenroll', tag: 'Admissions', summary: 'Réinscription à partir d’un dossier antérieur', auth: 'bearer', roles: [...direction] },

  { method: 'get', path: '/audit-log', tag: 'Audit', summary: 'Journal d’audit serveur (IAM-005, lecture direction)', auth: 'bearer', roles: [...direction] },

  { method: 'post', path: '/backups/run', tag: 'Sauvegardes', summary: 'Déclencher une sauvegarde pg_dump', auth: 'bearer', roles: ['admin'] },
  { method: 'get', path: '/backups', tag: 'Sauvegardes', summary: 'Lister les sauvegardes', auth: 'bearer', roles: ['admin'] },
  { method: 'post', path: '/backups/cleanup', tag: 'Sauvegardes', summary: 'Purger selon la rétention', auth: 'bearer', roles: ['admin'] },
  { method: 'post', path: '/backups/download-url', tag: 'Sauvegardes', summary: 'URL présignée de téléchargement', auth: 'bearer', roles: ['admin'] },
  { method: 'post', path: '/backups/verify', tag: 'Sauvegardes', summary: 'Vérifier un dump (pg_restore --list)', auth: 'bearer', roles: ['admin'] },

  { method: 'get', path: '/admin/search', tag: 'Ops admin', summary: 'Recherche globale users/établissements', auth: 'bearer', roles: ['admin'] },
  { method: 'get', path: '/admin/ops-metrics', tag: 'Ops admin', summary: 'Métriques ops (jobs, process role)', auth: 'bearer', roles: ['admin'] },
  { method: 'get', path: '/admin/ropa', tag: 'Ops admin', summary: 'Registre des traitements (RoPA)', auth: 'bearer', roles: ['admin'] },
  { method: 'put', path: '/admin/ropa', tag: 'Ops admin', summary: 'Mettre à jour le RoPA', auth: 'bearer', roles: ['admin'] },
  { method: 'get', path: '/admin/dismissed-alerts', tag: 'Ops admin', summary: 'Alertes dismissées (UI ops)', auth: 'bearer', roles: ['admin'] },
  { method: 'put', path: '/admin/dismissed-alerts', tag: 'Ops admin', summary: 'Mettre à jour les alertes dismissées', auth: 'bearer', roles: ['admin'] },
  { method: 'get', path: '/admin/communications', tag: 'Ops admin', summary: 'File / échecs communications', auth: 'bearer', roles: ['admin'] },
  { method: 'post', path: '/admin/communications/:id/retry', tag: 'Ops admin', summary: 'Réessayer un envoi échoué', auth: 'bearer', roles: ['admin'] },
  { method: 'post', path: '/admin/communications/purge-failed', tag: 'Ops admin', summary: 'Purger les échecs anciens', auth: 'bearer', roles: ['admin'] },
  { method: 'get', path: '/admin/campaign-recipients', tag: 'Ops admin', summary: 'Destinataires campagne ops', auth: 'bearer', roles: ['admin'] },
  { method: 'post', path: '/admin/campaign-send', tag: 'Ops admin', summary: 'Envoyer une campagne ops', auth: 'bearer', roles: ['admin'] },
  { method: 'post', path: '/admin/campaign-schedule', tag: 'Ops admin', summary: 'Planifier une campagne', auth: 'bearer', roles: ['admin'], statuses: [201] },
  { method: 'get', path: '/admin/campaign-schedule', tag: 'Ops admin', summary: 'Lister les campagnes planifiées', auth: 'bearer', roles: ['admin'] },
  { method: 'get', path: '/admin/campaign-delivery-report', tag: 'Ops admin', summary: 'Rapport de livraison campagnes', auth: 'bearer', roles: ['admin'] },
  { method: 'post', path: '/admin/impersonate', tag: 'Ops admin', summary: 'Impersonation auditée time-boxed', auth: 'bearer', roles: ['admin'], statuses: [200, 400, 403, 404] },
  { method: 'post', path: '/admin/impersonate/exit', tag: 'Ops admin', summary: 'Sortir d’une impersonation (JWT cible)', auth: 'bearer', statuses: [200, 400, 403] },
  { method: 'get', path: '/admin/billing-metrics', tag: 'Ops admin', summary: 'MRR / ARR / churn (base abonnements)', auth: 'bearer', roles: ['admin'] },
  { method: 'get', path: '/admin/product-telemetry', tag: 'Ops admin', summary: 'Agrégats product.*', auth: 'bearer', roles: ['admin'] },
  { method: 'get', path: '/admin/dunning-queue', tag: 'Ops admin', summary: 'File dunning (abos en grâce)', auth: 'bearer', roles: ['admin'] },
  { method: 'post', path: '/admin/dunning-run', tag: 'Ops admin', summary: 'Déclencher un passage dunning', auth: 'bearer', roles: ['admin'] },
  { method: 'get', path: '/admin/audit-retention', tag: 'Ops admin', summary: 'Politique de rétention audit', auth: 'bearer', roles: ['admin'] },
  { method: 'put', path: '/admin/audit-retention', tag: 'Ops admin', summary: 'Mettre à jour la rétention audit', auth: 'bearer', roles: ['admin'] },
  { method: 'post', path: '/admin/audit-retention/purge', tag: 'Ops admin', summary: 'Purger les logs hors rétention', auth: 'bearer', roles: ['admin'] },
  { method: 'get', path: '/admin/overage-policy', tag: 'Ops admin', summary: 'Politique overages (warn/hard)', auth: 'bearer', roles: ['admin'] },
  { method: 'put', path: '/admin/overage-policy', tag: 'Ops admin', summary: 'Mettre à jour la politique overages', auth: 'bearer', roles: ['admin'] },
  { method: 'get', path: '/admin/quota-warnings', tag: 'Ops admin', summary: 'Alertes quotas actives', auth: 'bearer', roles: ['admin'] },
  { method: 'get', path: '/admin/platform-ops-acl', tag: 'Ops admin', summary: 'ACL scopes ops plateforme', auth: 'bearer', roles: ['admin'] },
  { method: 'put', path: '/admin/platform-ops-acl', tag: 'Ops admin', summary: 'Mettre à jour l’ACL ops', auth: 'bearer', roles: ['admin'] },
  { method: 'get', path: '/admin/me/scopes', tag: 'Ops admin', summary: 'Scopes ops de l’admin courant', auth: 'bearer', roles: ['admin'] },
  { method: 'get', path: '/admin/contact-messages', tag: 'Ops admin', summary: 'File messages contact public', auth: 'bearer', roles: ['admin'] },
  { method: 'patch', path: '/admin/contact-messages/:id', tag: 'Ops admin', summary: 'Mettre à jour un message contact', auth: 'bearer', roles: ['admin'] },
  { method: 'post', path: '/admin/contact-messages/:id/convert', tag: 'Ops admin', summary: 'Convertir un contact en ticket', auth: 'bearer', roles: ['admin'], statuses: [200, 404] },

  { method: 'post', path: '/subscriptions/:id/admin/sync-stripe', tag: 'Abonnement', summary: 'Sync abo depuis Stripe (422 si DB only)', auth: 'bearer', roles: ['admin'], statuses: [200, 404, 422, 501] },
  { method: 'post', path: '/subscriptions/:id/admin/billing-portal', tag: 'Abonnement', summary: 'Portail Stripe customer (ops)', auth: 'bearer', roles: ['admin'], statuses: [200, 422, 501] },

  { method: 'post', path: '/support/tickets', tag: 'Support', summary: 'Ouvrir un ticket', auth: 'bearer', statuses: [201] },
  { method: 'get', path: '/support/tickets', tag: 'Support', summary: 'Lister les tickets visibles', auth: 'bearer' },
  { method: 'get', path: '/support/tickets/:id', tag: 'Support', summary: 'Lire un ticket et son fil', auth: 'bearer' },
  { method: 'post', path: '/support/tickets/:id/messages', tag: 'Support', summary: 'Ajouter un message', auth: 'bearer', statuses: [201] },
  { method: 'patch', path: '/support/tickets/:id', tag: 'Support', summary: 'Modifier statut/priorité (personnel)', auth: 'bearer', roles: [...direction] },
  { method: 'post', path: '/support/tickets/:id/escalate', tag: 'Support', summary: 'Escalader un ticket (ops)', auth: 'bearer', roles: ['admin', 'school_admin'] },

  { method: 'post', path: '/contact', tag: 'Contact', summary: 'Formulaire contact public → file ops', auth: 'public', statuses: [201, 400, 429] },

  { method: 'get', path: '/services/transport/routes', tag: 'Services (Lot 9)', summary: 'Lister les lignes de transport', auth: 'bearer' },
  { method: 'post', path: '/services/transport/routes', tag: 'Services (Lot 9)', summary: 'Créer une ligne de transport', auth: 'bearer', roles: [...direction], statuses: [201] },
  { method: 'patch', path: '/services/transport/routes/:id', tag: 'Services (Lot 9)', summary: 'Modifier une ligne', auth: 'bearer', roles: [...direction] },
  { method: 'post', path: '/services/transport/routes/:id/enroll', tag: 'Services (Lot 9)', summary: 'Inscrire un élève à une ligne', auth: 'bearer', roles: [...direction], statuses: [201] },
  { method: 'post', path: '/services/transport/enrollments/:id/end', tag: 'Services (Lot 9)', summary: 'Clôturer une inscription transport', auth: 'bearer', roles: [...direction] },
  { method: 'get', path: '/services/canteen/plans', tag: 'Services (Lot 9)', summary: 'Lister les forfaits cantine', auth: 'bearer' },
  { method: 'post', path: '/services/canteen/plans', tag: 'Services (Lot 9)', summary: 'Créer un forfait cantine', auth: 'bearer', roles: [...direction], statuses: [201] },
  { method: 'patch', path: '/services/canteen/plans/:id', tag: 'Services (Lot 9)', summary: 'Modifier un forfait cantine', auth: 'bearer', roles: [...direction] },
  { method: 'post', path: '/services/canteen/plans/:id/subscribe', tag: 'Services (Lot 9)', summary: 'Souscrire un élève à la cantine (+ facture si prix > 0)', auth: 'bearer', roles: [...direction], statuses: [201] },
  { method: 'post', path: '/services/canteen/subscriptions/:id/invoice', tag: 'Services (Lot 9)', summary: 'Backfill facture cantine', auth: 'bearer', roles: [...direction], statuses: [201, 400, 409] },
  { method: 'post', path: '/services/canteen/subscriptions/:id/end', tag: 'Services (Lot 9)', summary: 'Clôturer une souscription cantine', auth: 'bearer', roles: [...direction] },
  { method: 'get', path: '/services/mine', tag: 'Services (Lot 9)', summary: 'Parent — cantine/transport des enfants liés', auth: 'bearer', roles: ['parent'] },
  { method: 'get', path: '/services/library/items', tag: 'Services (Lot 9)', summary: 'Catalogue bibliothèque', auth: 'bearer' },
  { method: 'post', path: '/services/library/items', tag: 'Services (Lot 9)', summary: 'Ajouter un ouvrage', auth: 'bearer', roles: [...direction], statuses: [201] },
  { method: 'post', path: '/services/library/items/:id/loan', tag: 'Services (Lot 9)', summary: 'Emprunter un ouvrage', auth: 'bearer', roles: [...direction], statuses: [201] },
  { method: 'post', path: '/services/library/loans/:id/return', tag: 'Services (Lot 9)', summary: 'Retourner un emprunt', auth: 'bearer', roles: [...direction] },
  { method: 'get', path: '/services/boarding/rooms', tag: 'Services (Lot 9)', summary: 'Lister les chambres internat', auth: 'bearer' },
  { method: 'post', path: '/services/boarding/rooms', tag: 'Services (Lot 9)', summary: 'Créer une chambre', auth: 'bearer', roles: [...direction], statuses: [201] },
  { method: 'post', path: '/services/boarding/rooms/:id/assign', tag: 'Services (Lot 9)', summary: 'Affecter un élève à une chambre', auth: 'bearer', roles: [...direction], statuses: [201] },
  { method: 'post', path: '/services/boarding/assignments/:id/end', tag: 'Services (Lot 9)', summary: 'Clôturer une affectation internat', auth: 'bearer', roles: [...direction] },
  { method: 'get', path: '/services/clinic/visits', tag: 'Services (Lot 9)', summary: 'Lister les visites infirmerie', auth: 'bearer' },
  { method: 'post', path: '/services/clinic/visits', tag: 'Services (Lot 9)', summary: 'Enregistrer une visite', auth: 'bearer', roles: [...direction], statuses: [201] },
  { method: 'get', path: '/services/hr/staff', tag: 'Services (Lot 9)', summary: 'Lister le personnel RH annexe', auth: 'bearer' },
  { method: 'post', path: '/services/hr/staff', tag: 'Services (Lot 9)', summary: 'Créer une fiche RH', auth: 'bearer', roles: [...direction], statuses: [201] },
];

export const OPENAPI_OPERATION_COUNT = OPENAPI_CATALOG.length;

const toOpenApiPath = (expressPath: string): string =>
  expressPath.replace(/:([A-Za-z0-9_]+)/g, '{$1}');

const pathParams = (expressPath: string) =>
  [...expressPath.matchAll(/:([A-Za-z0-9_]+)/g)].map((m) => ({
    name: m[1],
    in: 'path' as const,
    required: true,
    schema: { type: 'string' },
  }));

export function buildOpenApiDocument() {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const op of OPENAPI_CATALOG) {
    const openApiPath = toOpenApiPath(op.path);
    const item = (paths[openApiPath] ??= {});
    const statuses = op.statuses ?? (op.auth === 'public' ? [200] : [200, 401, 403]);
    const responses: Record<string, { description: string }> = {};
    for (const code of statuses) {
      responses[String(code)] = {
        description:
          code === 200 || code === 201 || code === 202
            ? 'Succès'
            : code === 400
              ? 'Requête invalide (Zod)'
              : code === 401
                ? 'Non authentifié'
                : code === 403
                  ? 'Authentifié mais hors périmètre (tenant / rôle / relation)'
                  : code === 409
                    ? 'Conflit métier'
                    : code === 429
                      ? 'Limiteur de tentatives'
                      : code === 501
                        ? 'Intégration non configurée (dégradation explicite)'
                        : 'Réponse',
      };
    }
    if (op.auth === 'bearer' && !responses['401']) responses['401'] = { description: 'Non authentifié' };

    const operation: Record<string, unknown> = {
      tags: [op.tag],
      summary: op.summary,
      operationId: `${op.method}_${op.path.replace(/[/:]+/g, '_').replace(/^_|_$/g, '')}`,
      description: op.roles?.length ? `Rôles : ${op.roles.join(', ')}.` : undefined,
      security: op.auth === 'bearer' ? [{ bearerAuth: [] }] : [],
      parameters: pathParams(op.path),
      responses,
    };
    if (op.method === 'post' || op.method === 'put' || op.method === 'patch') {
      operation.requestBody = {
        required: false,
        content: {
          'application/json': {
            schema: { type: 'object', additionalProperties: true, description: 'Validé par Zod dans la route.' },
          },
        },
      };
    }
    item[op.method] = operation;
  }

  return {
    openapi: '3.0.3',
    info: {
      title: 'CaddyNote API',
      version: '1.0.0',
      description:
        'API REST Node/Express + Prisma de CaddyNote (remplace les appels directs Supabase, chap. 22.2). ' +
        'Versionnée via `info.version`, pas un préfixe `/v1` (le frontend consomme déjà ces chemins). ' +
        'Auth : Bearer JWT dont le claim `sid` est une session serveur révocable (IAM-004). ' +
        'Isolation inter-tenant : `authz.ts` (ORG-004), jamais un filtre fourni par le client.',
    },
    servers: [{ url: 'http://localhost:4000', description: 'Développement local' }],
    tags: [...new Set(OPENAPI_CATALOG.map((op) => op.tag))].map((name) => ({ name })),
    paths,
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Jeton renvoyé par POST /auth/login (claim sid = session serveur).',
        },
      },
    },
  };
}

export const OPENAPI_DOCS_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8"/>
  <title>CaddyNote API — documentation</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui.css"/>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui-bundle.js"></script>
  <script>
    window.ui = SwaggerUIBundle({
      url: '/openapi.json',
      dom_id: '#swagger-ui',
      presets: [SwaggerUIBundle.presets.apis],
    });
  </script>
</body>
</html>
`;
