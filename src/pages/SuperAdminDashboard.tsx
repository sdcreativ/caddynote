import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStrkAuth } from "@/hooks/useStrkAuth";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import SuperAdminSidebar from "@/components/admin/SuperAdminSidebar";
import SuperAdminOverview from "@/components/admin/SuperAdminOverview";
import SuperAdminUsers from "@/components/admin/SuperAdminUsers";
import SuperAdminTeachers from "@/components/admin/SuperAdminTeachers";
import SuperAdminStudents from "@/components/admin/SuperAdminStudents";
import SuperAdminClasses from "@/components/admin/SuperAdminClasses";
import InstitutionManager from "@/components/admin/InstitutionManager";
import SystemManagement from "@/components/admin/SystemManagement";
import SubscriptionManager from "@/components/admin/SubscriptionManager";
import AnalyticsCenter from "@/components/admin/AnalyticsCenter";
import AlertsCenter from "@/components/admin/AlertsCenter";
import LogsCenter from "@/components/admin/LogsCenter";
import ObservabilityCenter from "@/components/admin/ObservabilityCenter";
import AdvancedUserManagement from "@/components/admin/AdvancedUserManagement";
import BusinessKPIDashboard from "@/components/admin/BusinessKPIDashboard";
import SecurityComplianceCenter from "@/components/admin/SecurityComplianceCenter";
import CommunicationTools from "@/components/admin/CommunicationTools";
import PlatformSettings from "@/components/admin/PlatformSettings";
import SupportOpsCenter from "@/components/admin/SupportOpsCenter";
import PlatformHabilitationsCenter from "@/components/admin/PlatformHabilitationsCenter";
import { usePlatformPermissions } from "@/hooks/usePlatformPermissions";
import { CreateClassDialog } from '@/components/admin/CreateClassDialog';
import { SuperAdminNotificationsBell } from '@/components/admin/SuperAdminNotificationsBell';
import { RealtimeNotifications } from '@/components/notifications/RealtimeNotifications';
import { Toaster } from '@/components/ui/toaster';
import { trackProductEvent } from '@/lib/productTelemetry';
import { ForceChangePasswordDialog } from '@/components/auth/ForceChangePasswordDialog';
import { MfaSecurityBanner } from '@/components/auth/MfaSecurityBanner';
import { TwoFactorAuthDialog } from '@/components/settings/TwoFactorAuthDialog';

export const SUPER_ADMIN_SECTIONS = [
  'overview',
  'users',
  'teachers',
  'students',
  'classes',
  'institutions',
  'subscriptions',
  'system',
  'analytics',
  'logs',
  'performance',
  'observability',
  'critical-alerts',
  'advanced-users',
  'audit-trail',
  'business-kpis',
  'security-compliance',
  'communication-tools',
  'support-ops',
  'security',
  'notifications',
  'settings',
  'habilitations',
] as const;

export type SuperAdminSection = (typeof SUPER_ADMIN_SECTIONS)[number];

const isValidSection = (value: string | undefined): value is SuperAdminSection =>
  !!value && (SUPER_ADMIN_SECTIONS as readonly string[]).includes(value);

const SuperAdminDashboard = () => {
  const {
    user,
    mustChangePassword,
    clearMustChangePassword,
    mfaRecommended,
    dismissMfaPrompt,
    markMfaEnabled,
  } = useStrkAuth();
  const { t } = useTranslation('superAdmin');
  const { canSeeSection } = usePlatformPermissions();
  const navigate = useNavigate();
  const { section: sectionParam } = useParams<{ section?: string }>();
  const activeSection = useMemo(
    () => (isValidSection(sectionParam) ? sectionParam : 'overview'),
    [sectionParam]
  );
  const [showCreateClassDialog, setShowCreateClassDialog] = useState(false);
  const [demoRequestCount, setDemoRequestCount] = useState(0);
  const [mfaDialogOpen, setMfaDialogOpen] = useState(false);

  useEffect(() => {
    if (!sectionParam) return;
    // Alias historiques → sections fusionnées (P2 UX)
    if (sectionParam === 'audit-trail') {
      navigate('/super-admin/logs', { replace: true });
      return;
    }
    if (sectionParam === 'critical-alerts' || sectionParam === 'performance') {
      navigate('/super-admin/observability', { replace: true });
      return;
    }
    if (!isValidSection(sectionParam)) {
      navigate('/super-admin/overview', { replace: true });
      return;
    }
    if (!canSeeSection(sectionParam)) {
      navigate('/super-admin/overview', { replace: true });
    }
  }, [sectionParam, navigate, canSeeSection]);

  useEffect(() => {
    if (!isValidSection(sectionParam)) return;
    trackProductEvent(`super_admin.${sectionParam}`, `Section Super Admin: ${sectionParam}`);
  }, [sectionParam]);

  if (user?.role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  const setActiveSection = (section: string) => {
    navigate(`/super-admin/${section}`);
  };

  const renderContent = () => {
    switch (activeSection) {
      case 'overview':
        return <SuperAdminOverview />;
      case 'users':
        return <SuperAdminUsers />;
      case 'teachers':
        return <SuperAdminTeachers />;
      case 'students':
        return <SuperAdminStudents />;
      case 'classes':
        return <SuperAdminClasses />;
      case 'institutions':
        return <InstitutionManager />;
      case 'subscriptions':
        return <SubscriptionManager />;
      case 'system':
        return <SystemManagement />;
      case 'analytics':
        return <AnalyticsCenter />;
      case 'logs':
        return (
          <div className="space-y-4">
            <div>
              <h2 className="text-2xl font-bold">Journal d’audit</h2>
              <p className="text-sm text-muted-foreground">
                Source unique GET /audit-log (anciennes entrées « Logs » et « Audit trail »).
              </p>
            </div>
            <LogsCenter />
          </div>
        );
      case 'performance':
      case 'observability':
      case 'critical-alerts':
        return <ObservabilityCenter />;
      case 'advanced-users':
        return <AdvancedUserManagement />;
      case 'audit-trail':
        return (
          <div className="space-y-4">
            <div>
              <h2 className="text-2xl font-bold">Journal d’audit</h2>
              <p className="text-sm text-muted-foreground">Redirection — même source que Logs.</p>
            </div>
            <LogsCenter />
          </div>
        );
      case 'business-kpis':
        return <BusinessKPIDashboard />;
      case 'security-compliance':
        return <SecurityComplianceCenter />;
      case 'communication-tools':
        return <CommunicationTools />;
      case 'support-ops':
        return <SupportOpsCenter />;
      case 'security':
        return (
          <AlertsCenter
            title="Sécurité — alertes ops"
            focus="system"
            onNavigateSection={setActiveSection}
          />
        );
      case 'notifications':
        return (
          <AlertsCenter
            title="Notifications"
            focus="billing"
            onNavigateSection={setActiveSection}
          />
        );
      case 'settings':
        return <PlatformSettings />;
      case 'habilitations':
        return <PlatformHabilitationsCenter />;
      default:
        return <SuperAdminOverview />;
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#F5F7FB]">
      <SuperAdminSidebar
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        onCreateClass={() => setShowCreateClassDialog(true)}
        demoRequestCount={demoRequestCount}
      />
      <main className="min-h-screen lg:ml-[272px]">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-slate-200/80 bg-[#F5F7FB]/95 px-6 py-3 backdrop-blur sm:px-8">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{t('console')}</p>
            {demoRequestCount > 0 ? (
              <p className="truncate text-xs font-medium text-amber-700">
                {t('notificationsBell.demoSummary', { count: demoRequestCount })}
              </p>
            ) : (
              <p className="truncate text-xs text-slate-500">{t('consoleHint')}</p>
            )}
          </div>
          <SuperAdminNotificationsBell
            onOpenSupportOps={() => setActiveSection('support-ops')}
            onDemoCountChange={setDemoRequestCount}
          />
        </header>
        <div className="mx-auto w-full max-w-[1400px] p-6 sm:p-8">
          {mfaRecommended ? (
            <MfaSecurityBanner
              onEnable={() => setMfaDialogOpen(true)}
              onDismiss={dismissMfaPrompt}
            />
          ) : null}
          {renderContent()}
        </div>
      </main>

      <ForceChangePasswordDialog
        open={mustChangePassword}
        onCompleted={clearMustChangePassword}
      />
      <TwoFactorAuthDialog
        open={mfaDialogOpen}
        onOpenChange={setMfaDialogOpen}
        dismissible
        onEnabled={() => {
          markMfaEnabled();
          setMfaDialogOpen(false);
        }}
      />
      <CreateClassDialog
        open={showCreateClassDialog}
        onOpenChange={setShowCreateClassDialog}
      />
      <RealtimeNotifications />
      <Toaster />
    </div>
  );
};

export default SuperAdminDashboard;
