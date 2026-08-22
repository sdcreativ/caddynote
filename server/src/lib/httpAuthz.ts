import type { Response } from 'express';
import type { JwtPayload } from './jwt.js';
import {
  getCourseInstitutionId,
  getStudentAccess,
  isSameInstitution,
  isStudentAccessDenied,
  type GuardianPermission,
  type StudentAccess,
} from './authz.js';

/** Réponse 403 unique — ne pas recoder le libellé dans chaque routeur. */
export const FORBIDDEN_BODY = { error: 'Permissions insuffisantes' } as const;

export const sendForbidden = (res: Response): void => {
  res.status(403).json(FORBIDDEN_BODY);
};

/**
 * @returns true si la requête a déjà été rejetée (403). À utiliser :
 * `if (rejectUnlessSameInstitution(res, req.auth!, id)) return;`
 */
export const rejectUnlessSameInstitution = (
  res: Response,
  auth: JwtPayload,
  institutionId: string | null | undefined
): boolean => {
  if (isSameInstitution(auth, institutionId ?? null)) return false;
  sendForbidden(res);
  return true;
};

export type AllowedStudentAccess = Extract<StudentAccess, { allowed: true }>;

/**
 * Résout l’accès élève et envoie 403 si refusé. @returns l’accès autorisé,
 * ou `null` si la réponse a déjà été envoyée.
 */
export const rejectUnlessStudentAccess = async (
  res: Response,
  auth: JwtPayload,
  studentId: string,
  options?: { guardianPermission?: GuardianPermission; denyGuardian?: boolean }
): Promise<AllowedStudentAccess | null> => {
  const access = await getStudentAccess(auth, studentId);
  if (isStudentAccessDenied(access, options) || !access.allowed) {
    sendForbidden(res);
    return null;
  }
  return access;
};

/**
 * Id d’établissement déjà résolu : `null` (ressource introuvable) ou autre
 * tenant → 403, sans distinguer les deux (ORG-004). Ne pas utiliser quand
 * la route répond volontairement 404 pour masquer l’existence.
 */
export const rejectUnlessResolvedTenant = (
  res: Response,
  auth: JwtPayload,
  institutionId: string | null | undefined
): string | null => {
  if (!institutionId || !isSameInstitution(auth, institutionId)) {
    sendForbidden(res);
    return null;
  }
  return institutionId;
};

/**
 * Tenant d’un cours : id manquant (cours introuvable) ou autre
 * établissement → 403. Même règle que notes/devoirs.
 */
export const rejectUnlessCourseTenant = async (
  res: Response,
  auth: JwtPayload,
  courseId: string
): Promise<string | null> => {
  const institutionId = await getCourseInstitutionId(courseId);
  return rejectUnlessResolvedTenant(res, auth, institutionId);
};
