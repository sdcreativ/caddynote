import { describe, it, expect } from 'vitest';
import {
  canManageAssignment,
  canManageCourse,
  isSameInstitution,
  isStudentAccessDenied,
  tenantWhere,
  type StudentAccess,
} from '../lib/authz.js';
import type { JwtPayload } from '../lib/jwt.js';

const auth = (over: Partial<JwtPayload> = {}): JwtPayload => ({
  sub: 'user-1',
  role: 'teacher',
  institutionId: 'inst-a',
  sid: 'sid-1',
  ...over,
});

const guardianAccess = (permissions: Partial<Extract<StudentAccess, { via: 'guardian' }>['permissions']>): StudentAccess => ({
  allowed: true,
  via: 'guardian',
  permissions: {
    canViewGrades: false,
    canViewAttendance: false,
    canViewBilling: false,
    canMakePayments: false,
    canViewDiscipline: false,
    canViewHealth: false,
    ...permissions,
  },
});

describe('Helpers d’autorisation partagés (plus de copies dans les routeurs)', () => {
  it('tenantWhere : admin global sans filtre, le reste scopé au JWT', () => {
    expect(tenantWhere(auth({ role: 'admin', institutionId: null }))).toEqual({});
    expect(tenantWhere(auth())).toEqual({ institutionId: 'inst-a' });
    expect(tenantWhere(auth({ institutionId: null }))).toEqual({ institutionId: '__none__' });
  });

  it('canManageCourse / canManageAssignment : titulaire ou direction, pas un collègue', () => {
    const teacher = auth({ sub: 't1', role: 'teacher' });
    const peer = auth({ sub: 't2', role: 'teacher' });
    const direction = auth({ sub: 'dir', role: 'school_admin' });
    const course = { teacherId: 't1' };

    expect(canManageCourse(teacher, course)).toBe(true);
    expect(canManageCourse(peer, course)).toBe(false);
    expect(canManageCourse(direction, course)).toBe(true);
    expect(canManageCourse(teacher, { teacherId: null })).toBe(false);

    expect(canManageAssignment(teacher, { teacherId: 't1' }, course)).toBe(true);
    expect(canManageAssignment(peer, { teacherId: 't2' }, course)).toBe(true);
    expect(canManageAssignment(peer, { teacherId: 't1' }, course)).toBe(false);
    expect(canManageAssignment(direction, { teacherId: 't1' }, course)).toBe(true);
  });

  it('isSameInstitution : admin global toujours, sinon égalité stricte d’établissement', () => {
    expect(isSameInstitution(auth({ role: 'admin', institutionId: null }), 'inst-b')).toBe(true);
    expect(isSameInstitution(auth(), 'inst-a')).toBe(true);
    expect(isSameInstitution(auth(), 'inst-b')).toBe(false);
    expect(isSameInstitution(auth(), null)).toBe(false);
  });

  it('isStudentAccessDenied : staff/self ok ; parent selon le droit du lien', () => {
    expect(isStudentAccessDenied({ allowed: false })).toBe(true);
    expect(isStudentAccessDenied({ allowed: true, via: 'staff' })).toBe(false);
    expect(isStudentAccessDenied({ allowed: true, via: 'self' })).toBe(false);
    expect(isStudentAccessDenied({ allowed: true, via: 'admin' }, { denyGuardian: true })).toBe(false);

    expect(isStudentAccessDenied(guardianAccess({ canViewGrades: true }), { guardianPermission: 'canViewGrades' })).toBe(
      false
    );
    expect(isStudentAccessDenied(guardianAccess({ canViewGrades: false }), { guardianPermission: 'canViewGrades' })).toBe(
      true
    );
    expect(isStudentAccessDenied(guardianAccess({ canViewAttendance: true }), { denyGuardian: true })).toBe(true);
    expect(isStudentAccessDenied(guardianAccess({}), { guardianPermission: 'canViewBilling' })).toBe(true);
  });
});
