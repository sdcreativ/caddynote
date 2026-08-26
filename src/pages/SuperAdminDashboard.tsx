import { useEffect, useMemo, useState } from 'react';
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
import { trackProductEvent } from '@/lib/productTelemetry';

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
  const { user } = useStrkAuth();
  const { canSeeSection } = usePlatformPermissions();
  const navigate = useNavigate();
  const { section: sectionParam } = useParams<{ section?: string }>();
  const activeSection = useMemo(
    () => (isValidSection(sectionParam) ? sectionParam : 'overview'),
    [sectionParam]
  );
  const [showCreateClassDialog, setShowCreateClassDialog] = useState(false);

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
      />
      <main className="min-h-screen lg:ml-[272px]">
        <div className="mx-auto w-full max-w-[1400px] p-6 sm:p-8">{renderContent()}</div>
      </main>

      <CreateClassDialog
        open={showCreateClassDialog}
        onOpenChange={setShowCreateClassDialog}
      />
    </div>
  );
};

export default SuperAdminDashboard;
