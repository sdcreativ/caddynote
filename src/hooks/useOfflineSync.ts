import { useCallback, useEffect, useState } from 'react';
import { countPendingAttendance } from '@/lib/offlineDb';
import { flushPendingAttendance } from '@/lib/offlineSync';

/**
 * État de connectivité + file d'attente hors ligne (PRS-003), pour afficher
 * un indicateur et déclencher une resynchronisation dès le retour du réseau.
 */
export const useOfflineSync = () => {
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [pendingCount, setPendingCount] = useState(0);

  const refreshPendingCount = useCallback(async () => {
    setPendingCount(await countPendingAttendance());
  }, []);

  useEffect(() => {
    void refreshPendingCount();

    const handleOnline = () => {
      setIsOnline(true);
      flushPendingAttendance().finally(() => void refreshPendingCount());
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    const interval = setInterval(() => void refreshPendingCount(), 5000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [refreshPendingCount]);

  return { isOnline, pendingCount, refreshPendingCount };
};
