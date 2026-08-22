import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useStrkAuth } from '@/hooks/useStrkAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { hasAnyRole } from '@/lib/roles';
import { StrkUserRole } from '@/types/strk';
import { useTranslation } from 'react-i18next';

interface ProtectedRouteProps {
  children: ReactNode;
  /** Rôle exact — préférer `requiredRoles` (famille serveur) dès qu’un équivalent existe. */
  requiredRole?: StrkUserRole;
  /** Un des rôles suffit (ex. TEACHING_ROLES). Prioritaire sur `requiredRole`. */
  requiredRoles?: readonly StrkUserRole[];
  requiredPermission?: {
    resource: string;
    action: 'create' | 'read' | 'update' | 'delete';
  };
}

const ProtectedRoute = ({ children, requiredRole, requiredRoles, requiredPermission }: ProtectedRouteProps) => {
  const { user, isLoading } = useStrkAuth();
  const { hasPermission } = usePermissions();
  const { t } = useTranslation('auth');

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto"></div>
          <p className="text-muted-foreground">{t('checking')}</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/sign" replace />;
  }

  const allowedRoles = requiredRoles ?? (requiredRole ? [requiredRole] : null);
  if (allowedRoles && !hasAnyRole(user.role, allowedRoles)) {
    return <Navigate to="/dashboard" replace />;
  }

  if (requiredPermission && !hasPermission(requiredPermission.resource, requiredPermission.action)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
