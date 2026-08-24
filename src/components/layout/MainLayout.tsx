import { useState, useEffect, ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useStrkAuth } from '@/hooks/useStrkAuth';
import { TwoFactorAuthDialog } from '@/components/settings/TwoFactorAuthDialog';
import StrkNavbar from './StrkNavbar';
import StrkSidebar from './StrkSidebar';
import MobileBottomNav from './MobileBottomNav';
import { OfflineBanner } from './OfflineBanner';
import SubscriptionNotifications from '@/components/subscription/SubscriptionNotifications';
import { Toaster } from '@/components/ui/toaster';
import { QuickActionsManager } from '@/components/quick-actions/QuickActionsManager';
import { RealtimeNotifications } from '@/components/notifications/RealtimeNotifications';
import { EstablishmentDashboardProvider } from '@/hooks/useEstablishmentDashboardContext';
import { useTranslation } from 'react-i18next';
import { isSchoolShellRole, mobileBottomNavForRole } from '@/lib/navConfig';
import { cn } from '@/lib/utils';

interface MainLayoutProps {
  children: ReactNode;
}

const MainLayout = ({ children }: MainLayoutProps) => {
  const { user, mfaSetupRequired, dismissMfaPrompt, markMfaEnabled } = useStrkAuth();
  const { t } = useTranslation('nav');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const isSchoolShell = isSchoolShellRole(user?.role);
  const hasMobileBottomNav = Boolean(mobileBottomNavForRole(user?.role));

  const mfaPromptOpen = mfaSetupRequired;
  const toggleSidebar = () => setSidebarOpen((v) => !v);
  /** « Plus » de la barre mobile : ouvre/ferme le menu latéral. */
  const toggleMoreMenu = () => setSidebarOpen((v) => !v);

  useEffect(() => {
    const handleResize = () => {
      setSidebarOpen(window.innerWidth >= 1024);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (window.innerWidth < 1024) setSidebarOpen(false);
  }, [location.pathname]);

  if (!user) {
    return <Navigate to="/sign" replace />;
  }

  const shell = (
    <div className="relative flex h-screen bg-[#F5F7FB]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {t('skipToContent')}
      </a>
      <div className="print-hidden contents">
        <StrkSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      </div>

      <div className="flex min-h-screen flex-1 flex-col transition-all duration-300 lg:ml-[272px]">
        <div className="print-hidden">
          <StrkNavbar onToggleSidebar={toggleSidebar} />
          <OfflineBanner />
        </div>

        <main
          id="main-content"
          tabIndex={-1}
          className={cn(
            'min-h-[calc(100vh-64px)] flex-1 px-4 pt-6 sm:px-6 md:px-8 lg:px-10',
            hasMobileBottomNav ? 'pb-28 lg:pb-10' : 'pb-10'
          )}
        >
          <div className="mx-auto w-full max-w-[1400px]">
            {!isSchoolShell && (
              <div className="mb-6">
                <SubscriptionNotifications />
              </div>
            )}
            {children}
          </div>
        </main>
        <TwoFactorAuthDialog
          open={mfaPromptOpen}
          onOpenChange={(open) => {
            if (!open) dismissMfaPrompt();
          }}
          dismissible={!mfaSetupRequired}
          onEnabled={markMfaEnabled}
        />
      </div>

      {hasMobileBottomNav && (
        <div className="print-hidden">
          <MobileBottomNav role={user.role} onOpenMore={toggleMoreMenu} />
        </div>
      )}

      <Toaster />
      <QuickActionsManager />
      <RealtimeNotifications />
    </div>
  );

  return isSchoolShell ? (
    <EstablishmentDashboardProvider>{shell}</EstablishmentDashboardProvider>
  ) : (
    shell
  );
};

export default MainLayout;
