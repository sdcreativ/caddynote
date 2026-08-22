import { WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useOfflineSync } from '@/hooks/useOfflineSync';

/**
 * UX-005 — bannière hors-ligne sur le shell authentifié.
 * Complète l’indicateur d’appel (OfflineStatusBadge) : ici toute l’app
 * sait qu’elle est déconnectée ; le détail de file d’attente reste sur
 * l’écran d’appel.
 */
export const OfflineBanner = () => {
  const { t } = useTranslation('nav');
  const { isOnline, pendingCount } = useOfflineSync();

  if (isOnline) return null;

  return (
    <p
      className="flex items-center justify-center gap-2 bg-amber-100 px-4 py-2 text-center text-sm text-amber-950"
      role="status"
      aria-live="polite"
    >
      <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>
        {pendingCount > 0
          ? t('offlineBannerWithPending', { count: pendingCount })
          : t('offlineBanner')}
      </span>
    </p>
  );
};
