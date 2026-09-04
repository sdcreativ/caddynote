import type { Response } from 'express';
import type { JwtPayload } from './jwt.js';
import { prisma } from './prisma.js';
import {
  getCourseInstitutionId,
  getStudentAccess,
  isGuardianOfInstitution,
  isSameInstitution,
  isStudentAccessDenied,
  listAccessibleStudentIds,
  listClassIdsForStudents,
  type GuardianPermission,
  type StudentAccess,
  type StudentListScope,
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

/**
 * Lecture : personnel du tenant, ou parent lié à un enfant de l’établissement.
 * Ne pas utiliser pour une écriture.
 */
export const rejectUnlessTenantOrGuardian = async (
  res: Response,
  auth: JwtPayload,
  institutionId: string | null | undefined
): Promise<boolean> => {
  if (isSameInstitution(auth, institutionId ?? null)) return false;
  if (await isGuardianOfInstitution(auth, institutionId)) return false;
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
 * Portée de liste : staff → tout le tenant ; élève/parent → leurs ids.
 * @returns null si 403 déjà envoyé.
 */
export const rejectUnlessListScope = async (
  res: Response,
  auth: JwtPayload,
  guardianPermission?: GuardianPermission
): Promise<Extract<StudentListScope, { kind: 'all' } | { kind: 'ids' }> | null> => {
  const scope = await listAccessibleStudentIds(auth, guardianPermission);
  if (scope.kind === 'none') {
    sendForbidden(res);
    return null;
  }
  return scope;
};

export const rejectUnlessCourseTenant = async (
  res: Response,
  auth: JwtPayload,
  courseId: string
): Promise<string | null> => {
  const institutionId = await getCourseInstitutionId(courseId);
  return rejectUnlessResolvedTenant(res, auth, institutionId);
};

export const rejectUnlessCourseTenantOrGuardian = async (
  res: Response,
  auth: JwtPayload,
  courseId: string
): Promise<string | null> => {
  const institutionId = await getCourseInstitutionId(courseId);
  if (!institutionId) {
    sendForbidden(res);
    return null;
  }
  if (await rejectUnlessTenantOrGuardian(res, auth, institutionId)) return null;
  return institutionId;
};

export type CourseReadTarget = { id: string; institutionId: string; classId: string | null };

/** Staff du tenant, ou élève/parent inscrit (classe ou courseStudents). */
export const rejectUnlessCanReadCourse = async (
  res: Response,
  auth: JwtPayload,
  course: CourseReadTarget
): Promise<boolean> => {
  if (await rejectUnlessTenantOrGuardian(res, auth, course.institutionId)) return true;
  const scope = await rejectUnlessListScope(res, auth);
  if (!scope) return true;
  if (scope.kind === 'all') return false;
  const classIds = await listClassIdsForStudents(scope.ids);
  if (course.classId && classIds.includes(course.classId)) return false;
  const linked = await prisma.strkCourseStudent.findFirst({
    where: { courseId: course.id, studentId: { in: scope.ids } },
    select: { id: true },
  });
  if (linked) return false;
  sendForbidden(res);
  return true;
};

export const rejectUnlessCanReadAssignment = async (
  res: Response,
  auth: JwtPayload,
  courseId: string
): Promise<boolean> => {
  const course = await prisma.strkCourse.findUnique({
    where: { id: courseId },
    select: { id: true, institutionId: true, classId: true },
  });
  if (!course) {
    sendForbidden(res);
    return true;
  }
  return rejectUnlessCanReadCourse(res, auth, course);
};
