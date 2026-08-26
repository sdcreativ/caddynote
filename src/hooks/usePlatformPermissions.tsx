import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/apiClient';
import { useStrkAuth } from '@/hooks/useStrkAuth';

/** Aligné sur `SECTION_REQUIRED_PERMISSION` serveur. */
export const SUPER_ADMIN_SECTION_PERMISSION: Record<string, string> = {
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

export type PlatformMeScopes = {
  scopes: string[];
  roleCodes: string[];
  permissions: string[];
  legacyFullAccess: boolean;
};

export const usePlatformPermissions = () => {
  const { user } = useStrkAuth();
  const [data, setData] = useState<PlatformMeScopes | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (user?.role !== 'admin') {
      setData(null);
      return;
    }
    setLoading(true);
    try {
      const res = await apiClient.get<PlatformMeScopes>('/admin/me/scopes');
      setData(res);
    } catch {
      setData({ scopes: [], roleCodes: [], permissions: [], legacyFullAccess: false });
    } finally {
      setLoading(false);
    }
  }, [user?.role]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const permissions = new Set(data?.permissions ?? []);
  const hasPermission = (code: string) => {
    if (user?.role === 'admin' && (loading || data === null)) return true;
    return permissions.has(code) || !!data?.legacyFullAccess;
  };
  const canSeeSection = (section: string) => {
    if (user?.role === 'admin' && (loading || data === null)) return true;
    const required = SUPER_ADMIN_SECTION_PERMISSION[section];
    if (!required) return hasPermission('platform.console.access');
    return hasPermission(required);
  };

  return {
    loading,
    roleCodes: data?.roleCodes ?? [],
    permissions: data?.permissions ?? [],
    legacyFullAccess: !!data?.legacyFullAccess,
    hasPermission,
    canSeeSection,
    reload,
  };
};
