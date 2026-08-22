import { useMemo } from 'react';
import { useStrkAuth } from '@/hooks/useStrkAuth';

export interface Permission {
  resource: string;
  action: 'create' | 'read' | 'update' | 'delete';
}

/**
 * Permissions UI (gating boutons / `ProtectedRoute.requiredPermission`).
 * La navigation par rôle est **uniquement** dans `src/lib/navConfig.ts`
 * (consommée par `StrkSidebar`) — pas de second menu ici.
 */
export const usePermissions = () => {
  const { user } = useStrkAuth();

  const permissions = useMemo(() => {
    if (!user) return [];

    const basePermissions: Permission[] = [
      { resource: 'profile', action: 'read' },
      { resource: 'profile', action: 'update' },
      { resource: 'notifications', action: 'read' },
      { resource: 'notifications', action: 'update' },
      { resource: 'messages', action: 'create' },
      { resource: 'messages', action: 'read' },
    ];

    switch (user.role) {
      case 'admin':
        return [
          ...basePermissions,
          { resource: '*', action: 'create' },
          { resource: '*', action: 'read' },
          { resource: '*', action: 'update' },
          { resource: '*', action: 'delete' },
        ];

      case 'school_admin':
        return [
          ...basePermissions,
          { resource: 'users', action: 'create' },
          { resource: 'users', action: 'read' },
          { resource: 'users', action: 'update' },
          { resource: 'users', action: 'delete' },
          { resource: 'classes', action: 'create' },
          { resource: 'classes', action: 'read' },
          { resource: 'classes', action: 'update' },
          { resource: 'classes', action: 'delete' },
          { resource: 'courses', action: 'create' },
          { resource: 'courses', action: 'read' },
          { resource: 'courses', action: 'update' },
          { resource: 'courses', action: 'delete' },
          { resource: 'schedules', action: 'create' },
          { resource: 'schedules', action: 'read' },
          { resource: 'schedules', action: 'update' },
          { resource: 'schedules', action: 'delete' },
          { resource: 'attendance', action: 'read' },
          { resource: 'grades', action: 'read' },
          { resource: 'grades', action: 'create' },
          { resource: 'assignments', action: 'read' },
          { resource: 'submissions', action: 'read' },
          { resource: 'students', action: 'read' },
          { resource: 'admissions', action: 'read' },
          { resource: 'admissions', action: 'update' },
          { resource: 'exports', action: 'create' },
          { resource: 'finance', action: 'read' },
        ];

      case 'secretary':
        return [
          ...basePermissions,
          { resource: 'users', action: 'create' },
          { resource: 'users', action: 'read' },
          { resource: 'users', action: 'update' },
          { resource: 'classes', action: 'create' },
          { resource: 'classes', action: 'read' },
          { resource: 'classes', action: 'update' },
          { resource: 'students', action: 'read' },
          { resource: 'admissions', action: 'read' },
          { resource: 'admissions', action: 'update' },
        ];

      case 'teacher':
      case 'head_teacher':
        return [
          ...basePermissions,
          { resource: 'attendance', action: 'create' },
          { resource: 'attendance', action: 'read' },
          { resource: 'attendance', action: 'update' },
          { resource: 'grades', action: 'create' },
          { resource: 'grades', action: 'read' },
          { resource: 'grades', action: 'update' },
          { resource: 'grades', action: 'delete' },
          { resource: 'assignments', action: 'create' },
          { resource: 'assignments', action: 'read' },
          { resource: 'assignments', action: 'update' },
          { resource: 'assignments', action: 'delete' },
          { resource: 'submissions', action: 'read' },
          { resource: 'submissions', action: 'update' },
          { resource: 'students', action: 'read' },
          { resource: 'classes', action: 'read' },
          { resource: 'courses', action: 'read' },
          { resource: 'schedules', action: 'read' },
          { resource: 'exports', action: 'create' },
        ];

      case 'student':
        return [
          ...basePermissions,
          { resource: 'grades', action: 'read' },
          { resource: 'assignments', action: 'read' },
          { resource: 'attendance', action: 'read' },
          { resource: 'schedules', action: 'read' },
          { resource: 'classes', action: 'read' },
          { resource: 'courses', action: 'read' },
          { resource: 'submissions', action: 'create' },
          { resource: 'submissions', action: 'read' },
          { resource: 'submissions', action: 'update' },
          { resource: 'absences', action: 'create' },
          { resource: 'absences', action: 'read' },
          { resource: 'absences', action: 'update' },
        ];

      case 'accountant':
        return [
          ...basePermissions,
          { resource: 'finance', action: 'create' },
          { resource: 'finance', action: 'read' },
          { resource: 'finance', action: 'update' },
          { resource: 'students', action: 'read' },
        ];

      case 'supervisor':
        return [
          ...basePermissions,
          { resource: 'attendance', action: 'create' },
          { resource: 'attendance', action: 'read' },
          { resource: 'attendance', action: 'update' },
          { resource: 'students', action: 'read' },
          { resource: 'classes', action: 'read' },
        ];

      case 'parent':
        return [
          ...basePermissions,
          { resource: 'children', action: 'read' },
          { resource: 'grades', action: 'read' },
          { resource: 'attendance', action: 'read' },
          { resource: 'schedules', action: 'read' },
          { resource: 'courses', action: 'read' },
          { resource: 'attendance', action: 'update' },
        ];

      case 'group_owner':
        return [
          ...basePermissions,
          { resource: 'institutions', action: 'read' },
          { resource: 'users', action: 'read' },
          { resource: 'students', action: 'read' },
          { resource: 'finance', action: 'read' },
        ];

      default:
        return basePermissions;
    }
  }, [user]);

  const hasPermission = (resource: string, action: 'create' | 'read' | 'update' | 'delete'): boolean => {
    if (!user) return false;

    return permissions.some(
      (permission) =>
        (permission.resource === '*' || permission.resource === resource) &&
        permission.action === action
    );
  };

  return {
    permissions,
    hasPermission,
    userRole: user?.role,
  };
};
