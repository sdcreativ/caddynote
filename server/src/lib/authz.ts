import { prisma } from './prisma.js';
import type { JwtPayload } from './jwt.js';
import type { StrkUserRole } from '@prisma/client';

/**
 * Couche d'autorisation applicative — remplace les policies RLS Supabase
 * (cf. audit §4.1 « principes d'autorisation » et §5.2).
 *
 * Principe : le rôle seul ne suffit jamais. Chaque accès à une ressource
 * vérifie en plus l'établissement (tenant) et, le cas échéant, la relation
 * explicite avec la ressource (ex. un parent doit avoir un lien actif et le
 * bon droit vers l'élève concerné — ELV-002).
 */

/** Direction d'établissement (paramétrage, inscriptions, notes officielles). */
export const DIRECTION_ROLES: StrkUserRole[] = ['admin', 'school_admin'];
/** Secrétariat : dossiers élèves, admissions, documents, comptes. */
export const SECRETARIAT_ROLES: StrkUserRole[] = ['admin', 'school_admin', 'secretary'];
/** Finance / économe. */
export const FINANCE_ROLES: StrkUserRole[] = ['admin', 'school_admin', 'accountant'];
/**
 * Publication d’une grille tarifaire (Lot 3) : direction uniquement.
 * Workflow §11 — le comptable crée/valide ; la direction publie.
 */
export const FEE_SCHEDULE_PUBLISH_ROLES: StrkUserRole[] = ['admin', 'school_admin'];
/** Enseignement (saisie notes, devoirs, ressources de cours). */
export const TEACHING_ROLES: StrkUserRole[] = ['admin', 'school_admin', 'teacher', 'head_teacher'];
/** Vie scolaire (appel, absences, discipline signalée). */
export const SUPERVISION_ROLES: StrkUserRole[] = ['admin', 'school_admin', 'teacher', 'head_teacher', 'supervisor'];
/** Exports / rapports (`GET /reports/export`, file planifiée) — miroir front `EXPORT_ROLES`. */
export const EXPORT_ROLES: StrkUserRole[] = ['admin', 'school_admin', 'teacher', 'head_teacher'];
/** Tout le personnel d'établissement — accès tenant aux fiches élèves. */
export const INSTITUTION_STAFF_ROLES: StrkUserRole[] = [
  'admin',
  'school_admin',
  'teacher',
  'head_teacher',
  'secretary',
  'accountant',
  'supervisor',
];

const STAFF_ROLES = INSTITUTION_STAFF_ROLES;

export const isGlobalAdmin = (auth: JwtPayload): boolean => auth.role === 'admin';

/** Un utilisateur peut-il agir au nom de cet établissement ? (ORG-004) */
export const isSameInstitution = (auth: JwtPayload, institutionId: string | null): boolean => {
  if (isGlobalAdmin(auth)) return true;
  return !!institutionId && auth.institutionId === institutionId;
};

/**
 * Filtre Prisma de liste : le périmètre vient du JWT, jamais d’un
 * `institutionId` fourni par le client (ORG-004). L’admin global n’est pas
 * restreint ; un compte sans établissement ne voit rien (`__none__`).
 */
export const tenantWhere = (auth: JwtPayload): { institutionId: string } | Record<string, never> =>
  isGlobalAdmin(auth) ? {} : { institutionId: auth.institutionId ?? '__none__' };

export type StudentAccess =
  | { allowed: false }
  | { allowed: true; via: 'admin' | 'staff' | 'self' }
  | {
      allowed: true;
      via: 'guardian';
      permissions: {
        canViewGrades: boolean;
        canViewAttendance: boolean;
        canViewBilling: boolean;
        canMakePayments: boolean;
        canViewDiscipline: boolean;
        canViewHealth: boolean;
      };
    };

/**
 * Détermine si l'utilisateur authentifié peut accéder aux données d'un
 * élève donné, et à quel titre. Utilisé par toutes les routes exposant des
 * données d'élève (fiche, absences, notes...) pour appliquer le bon niveau
 * de filtrage — c'est le cœur de la défense en profondeur "multi-enfants"
 * (ELV-002, PRS-004/005).
 */
export const getStudentAccess = async (auth: JwtPayload, studentId: string): Promise<StudentAccess> => {
  if (isGlobalAdmin(auth)) {
    return { allowed: true, via: 'admin' };
  }

  if (auth.sub === studentId) {
    return { allowed: true, via: 'self' };
  }

  if ((STAFF_ROLES as readonly string[]).includes(auth.role)) {
    const student = await prisma.strkStudent.findUnique({
      where: { id: studentId },
      select: { institutionId: true },
    });
    if (student && isSameInstitution(auth, student.institutionId)) {
      return { allowed: true, via: 'staff' };
    }
  }

  if (auth.role === 'parent') {
    const link = await prisma.strkStudentGuardian.findFirst({
      where: { studentId, guardianId: auth.sub, status: 'active' },
      select: {
        canViewGrades: true,
        canViewAttendance: true,
        canViewBilling: true,
        canMakePayments: true,
        canViewDiscipline: true,
        canViewHealth: true,
      },
    });
    if (link) {
      return { allowed: true, via: 'guardian', permissions: link };
    }
  }

  return { allowed: false };
};

export type GuardianPermission = keyof Extract<StudentAccess, { via: 'guardian' }>['permissions'];

/**
 * Refus d’accès élève, y compris le cas parent : un responsable lié n’a
 * accès qu’aux volets explicitement autorisés sur le lien
 * (`StrkStudentGuardian.canView*`). Sans ça, chaque route recopiait
 * `!access.allowed || (via === 'guardian' && !permissions.X)` et les
 * droits divergeaient (notes vs assiduité vs facturation).
 */
export const isStudentAccessDenied = (
  access: StudentAccess,
  options?: { guardianPermission?: GuardianPermission; denyGuardian?: boolean }
): boolean => {
  if (!access.allowed) return true;
  if (access.via !== 'guardian') return false;
  if (options?.denyGuardian) return true;
  if (options?.guardianPermission) return !access.permissions[options.guardianPermission];
  return false;
};

/**
 * Résout l'établissement d'un cours. Plusieurs entités liées à un cours
 * (notes, devoirs, soumissions...) n'ont pas d'`institutionId` propre — leur
 * tenant se déduit toujours du cours associé, jamais d'une valeur fournie
 * par l'appelant (ORG-004).
 */
export const getCourseInstitutionId = async (courseId: string): Promise<string | null> => {
  const course = await prisma.strkCourse.findUnique({ where: { id: courseId }, select: { institutionId: true } });
  return course?.institutionId ?? null;
};

/**
 * SUI-001/002/003/005 : contrôle d'accès à une observation pédagogique ou un
 * incident disciplinaire (`server/src/routes/observations.routes.ts`,
 * `discipline.routes.ts`). Deux niveaux de confidentialité ciblée
 * s'ajoutent à l'isolation tenant/relation habituelle (`getStudentAccess`) :
 *  - `restrictedToUserIds` : si non vide, seuls l'auteur, ces utilisateurs
 *    précis et la direction (`school_admin`, autorité de dernier ressort de
 *    l'établissement — jamais contournable par une restriction posée par un
 *    enseignant) voient l'entrée ; les autres membres du personnel non.
 *  - `visibleToFamily` : par défaut, la famille (élève lui-même et
 *    responsables) ne voit rien — une entrée doit être explicitement
 *    partagée pour leur être visible, même si le lien parent a par ailleurs
 *    le droit `canViewDiscipline`.
 */
export interface FollowUpEntry {
  studentId: string;
  authorId: string;
  restrictedToUserIds: string[];
  visibleToFamily: boolean;
}

/** Cœur synchrone de la règle de visibilité, séparé de la résolution de
 * `StudentAccess` pour pouvoir filtrer une liste entière sans refaire une
 * requête par ligne (`getStudentAccess` n'a besoin d'être résolu qu'une
 * fois par liste — cf. `GET /observations`, `GET /discipline/incidents`). */
export const isFollowUpVisible = (access: StudentAccess, auth: JwtPayload, entry: FollowUpEntry): boolean => {
  if (!access.allowed) return false;

  if (access.via === 'admin') return true;

  if (access.via === 'staff') {
    if (auth.role === 'school_admin') return true;
    if (auth.sub === entry.authorId) return true;
    if (entry.restrictedToUserIds.length === 0) return true;
    return entry.restrictedToUserIds.includes(auth.sub);
  }

  if (access.via === 'self') {
    return entry.visibleToFamily;
  }

  if (access.via === 'guardian') {
    return entry.visibleToFamily && access.permissions.canViewDiscipline;
  }

  return false;
};

/** Variante pratique pour une entrée unique (fiche, PATCH, DELETE) — résout
 * elle-même l'accès élève. Pour une liste, préférer `getStudentAccess` +
 * `isFollowUpVisible` pour éviter une requête par ligne. */
export const canViewFollowUpEntry = async (auth: JwtPayload, entry: FollowUpEntry): Promise<boolean> => {
  const access = await getStudentAccess(auth, entry.studentId);
  return isFollowUpVisible(access, auth, entry);
};

/**
 * ORG-002 : un `group_owner` a un accès consolidé en lecture aux
 * établissements de son groupe (annuaire + statistiques agrégées), jamais
 * aux données opérationnelles (élèves, notes...) qui restent isolées par
 * établissement (ORG-004) — volontairement plus restreint que
 * `isSameInstitution`, à utiliser uniquement là où une vue de groupe est
 * explicitement voulue (institutions, tableau de bord de groupe).
 */
export const isGroupOwnerOf = (auth: JwtPayload, institutionGroupId: string | null | undefined): boolean =>
  auth.role === 'group_owner' && !!auth.groupId && !!institutionGroupId && auth.groupId === institutionGroupId;

/**
 * Ensemble des identifiants de profils avec lesquels `auth` a le droit de
 * correspondre (ORG-004) : même établissement pour le personnel/élèves,
 * établissements des enfants suivis pour un parent, tout le monde pour
 * l'admin global. Utilisé par la messagerie (`/messages/contacts`, envoi) et
 * la communication multicanal (COM-001) pour valider un destinataire — sans
 * ça, n'importe quel compte pouvait lister/contacter des profils d'un autre
 * établissement (fuite ORG-004).
 */
export const getAllowedContactIds = async (auth: JwtPayload): Promise<Set<string> | 'all'> => {
  if (isGlobalAdmin(auth)) return 'all';

  if (auth.role === 'parent') {
    const links = await prisma.strkStudentGuardian.findMany({
      where: { guardianId: auth.sub, status: 'active' },
      select: { institutionId: true },
    });
    const institutionIds = [...new Set(links.map((l) => l.institutionId))];
    if (institutionIds.length === 0) return new Set();
    const profiles = await prisma.strkProfile.findMany({
      where: { institutionId: { in: institutionIds } },
      select: { id: true },
    });
    return new Set(profiles.map((p) => p.id));
  }

  if (!auth.institutionId) return new Set();
  const profiles = await prisma.strkProfile.findMany({
    where: { institutionId: auth.institutionId },
    select: { id: true },
  });
  return new Set(profiles.map((p) => p.id));
};
