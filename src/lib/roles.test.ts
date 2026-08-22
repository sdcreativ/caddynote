import { describe, it, expect } from 'vitest';
import {
  EXPORT_ROLES,
  SECRETARIAT_ROLES,
  TEACHING_ROLES,
  hasAnyRole,
} from './roles';

describe('Familles de rôles (alignées sur server/src/lib/authz.ts)', () => {
  it('hasAnyRole refuse un rôle absent ou hors famille', () => {
    expect(hasAnyRole(null, TEACHING_ROLES)).toBe(false);
    expect(hasAnyRole('parent', TEACHING_ROLES)).toBe(false);
    expect(hasAnyRole('secretary', TEACHING_ROLES)).toBe(false);
  });

  it('TEACHING_ROLES accepte head_teacher (pas seulement teacher)', () => {
    expect(hasAnyRole('teacher', TEACHING_ROLES)).toBe(true);
    expect(hasAnyRole('head_teacher', TEACHING_ROLES)).toBe(true);
    expect(hasAnyRole('school_admin', TEACHING_ROLES)).toBe(true);
  });

  it('SECRETARIAT_ROLES accepte secretary (pas seulement school_admin)', () => {
    expect(hasAnyRole('secretary', SECRETARIAT_ROLES)).toBe(true);
    expect(hasAnyRole('school_admin', SECRETARIAT_ROLES)).toBe(true);
    expect(hasAnyRole('teacher', SECRETARIAT_ROLES)).toBe(false);
  });

  it('EXPORT_ROLES colle à GET /reports/export (pas comptable ni group_owner)', () => {
    expect(hasAnyRole('teacher', EXPORT_ROLES)).toBe(true);
    expect(hasAnyRole('head_teacher', EXPORT_ROLES)).toBe(true);
    expect(hasAnyRole('accountant', EXPORT_ROLES)).toBe(false);
    expect(hasAnyRole('group_owner', EXPORT_ROLES)).toBe(false);
  });
});
