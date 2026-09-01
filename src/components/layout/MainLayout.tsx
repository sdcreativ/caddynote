import { useState, useEffect, useCallback, ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useStrkAuth } from '@/hooks/useStrkAuth';
import { TwoFactorAuthDialog } from '@/components/settings/TwoFactorAuthDialog';
import { ForceChangePasswordDialog } from '@/components/auth/ForceChangePasswordDialog';
import { MfaSecurityBanner } from '@/components/auth/MfaSecurityBanner';
import StrkNavbar from './StrkNavbar';
import StrkSidebar from './StrkSidebar';
import MobileBottomNav from './MobileBottomNav';
import { OfflineBanner } from './OfflineBanner';
import SubscriptionNotifications from '@/components/subscription/SubscriptionNotifications';
import { Toaster } from '@/components/ui/toaster';
import { QuickActionsManager } from '@/components/quick-actions/QuickActionsManager';
import { RealtimeNotifications } from '@/components/notifications/RealtimeNotifications';
import { EstablishmentDashboardProvider } from '@/hooks/useEstablishmentDashboardContext';
import { MobileShellProvider } from '@/hooks/useMobileShell';
import { useTranslation } from 'react-i18next';
import { isSchoolShellRole, mobileBottomNavForRole } from '@/lib/navConfig';
import { cn } from '@/lib/utils';

interface MainLayoutProps {
  children: ReactNode;
}

/** Écrans immersifs mobile : navbar classique masquée (bottom nav / header dédié). */
const isImmersiveMobilePath = (pathname: string, hasBottomNav: boolean) =>
  pathname === '/my-suivi' ||
  pathname === '/my-children' ||
  pathname.startsWith('/my-children/') ||
  (hasBottomNav && pathname === '/messages');

const MainLayout = ({ children }: MainLayoutProps) => {
  const {
    user,
    mustChangePassword,
    clearMustChangePassword,
    mfaRecommended,
    mfaSetupRequired,
    mfaGraceUntil,
    dismissMfaPrompt,
    markMfaEnabled,
  } = useStrkAuth();
  const { t } = useTranslation('nav');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mfaDialogOpen, setMfaDialogOpen] = useState(false);
  const location = useLocation();
  const isSchoolShell = isSchoolShellRole(user?.role);
  const hasMobileBottomNav = Boolean(mobileBottomNavForRole(user?.role));
  const hideNavbarOnMobile = isImmersiveMobilePath(location.pathname, hasMobileBottomNav);

  const mfaBlocking = mfaSetupRequired && !mustChangePassword;
  const mfaDialogVisible = mfaBlocking || mfaDialogOpen;

  const toggleSidebar = () => setSidebarOpen((v) => !v);
  /** « Plus / Menu » barre mobile + ⋮ Suivi : ouvre/ferme le menu latéral. */
  const toggleMoreMenu = useCallback(() => setSidebarOpen((v) => !v), []);

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

  /** Pendant MDP provisoire / MFA obligatoire : pas de shell métier (évite 403 toastés). */
  if (mustChangePassword || mfaBlocking) {
    return (
      <div className="relative flex min-h-screen items-center justify-center bg-[#F5F7FB] p-4">
        <ForceChangePasswordDialog
          open={mustChangePassword}
          onCompleted={clearMustChangePassword}
        />
        <TwoFactorAuthDialog
          open={mfaBlocking}
          onOpenChange={() => undefined}
          dismissible={false}
          onEnabled={() => {
            markMfaEnabled();
          }}
        />
        <Toaster />
      </div>
    );
  }

  const shell = (
    <MobileShellProvider openMoreMenu={toggleMoreMenu}>
      <div className="relative flex h-screen max-w-[100vw] overflow-x-hidden bg-[#F5F7FB]">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {t('skipToContent')}
        </a>
        <div className="print-hidden contents">
          <StrkSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        </div>

        <div className="flex min-h-screen min-w-0 flex-1 flex-col overflow-x-hidden transition-all duration-300 lg:ml-[272px]">
          <div className={cn('print-hidden', hideNavbarOnMobile && 'hidden lg:block')}>
            <StrkNavbar onToggleSidebar={toggleSidebar} />
            <OfflineBanner />
          </div>
          {hideNavbarOnMobile ? (
            <div className="print-hidden lg:hidden">
              <OfflineBanner />
            </div>
          ) : null}

          <main
            id="main-content"
            tabIndex={-1}
            className={cn(
              'min-h-[calc(100vh-64px)] min-w-0 flex-1 overflow-x-hidden px-4 sm:px-6 md:px-8 lg:px-10',
              hideNavbarOnMobile ? 'pt-0 lg:pt-6' : 'pt-6',
              hasMobileBottomNav ? 'pb-28 lg:pb-10' : 'pb-10'
            )}
          >
            <div className="mx-auto w-full min-w-0 max-w-[1400px]">
              {mfaRecommended ? (
                <MfaSecurityBanner
                  graceUntil={mfaGraceUntil}
                  onEnable={() => setMfaDialogOpen(true)}
                  onDismiss={dismissMfaPrompt}
                />
              ) : null}
              {!isSchoolShell && (
                <div className={cn('mb-6', hideNavbarOnMobile && 'hidden lg:block')}>
                  <SubscriptionNotifications />
                </div>
              )}
              {children}
            </div>
          </main>
          <ForceChangePasswordDialog
            open={mustChangePassword}
            onCompleted={clearMustChangePassword}
          />
          <TwoFactorAuthDialog
            open={mfaDialogVisible}
            onOpenChange={(open) => {
              if (mfaBlocking) return;
              setMfaDialogOpen(open);
            }}
            dismissible={!mfaBlocking}
            onEnabled={() => {
              markMfaEnabled();
              setMfaDialogOpen(false);
            }}
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
    </MobileShellProvider>
  );

  return isSchoolShell ? (
    <EstablishmentDashboardProvider>{shell}</EstablishmentDashboardProvider>
  ) : (
    shell
  );
};

export default MainLayout;
