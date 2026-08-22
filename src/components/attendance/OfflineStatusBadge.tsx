import { WifiOff, CloudUpload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { useOfflineSync } from '@/hooks/useOfflineSync';

/** Indicateur discret de connectivité + file de synchronisation (PRS-003).
 * Invisible quand tout est en ligne et synchronisé, pour ne pas encombrer
 * l'interface en usage normal. */
export function OfflineStatusBadge() {
  const { t } = useTranslation('attendance');
  const { t: tc } = useTranslation('common');
  const { isOnline, pendingCount } = useOfflineSync();

  if (isOnline && pendingCount === 0) return null;

  return (
    <Badge variant={isOnline ? 'secondary' : 'destructive'} className="flex items-center gap-1.5">
      {isOnline ? <CloudUpload className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
      {isOnline
        ? t('offline.syncing', { count: pendingCount })
        : pendingCount > 0
          ? t('offline.pending', { count: pendingCount })
          : tc('status.offline')}
    </Badge>
  );
}
