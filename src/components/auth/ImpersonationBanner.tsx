import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useStrkAuth } from '@/hooks/useStrkAuth';

/** Bandeau support ops pendant une impersonation time-boxed. */
const ImpersonationBanner = () => {
  const { impersonation, user, exitImpersonation } = useStrkAuth();
  if (!impersonation.active) return null;

  return (
    <div
      role="status"
      className="sticky top-0 z-[60] flex flex-wrap items-center justify-between gap-2 border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-950"
    >
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span>
          Impersonation active : <strong>{user?.email || user?.name}</strong>
          {impersonation.expiresAt
            ? ` · expire ${new Date(impersonation.expiresAt).toLocaleString('fr-FR')}`
            : ''}
        </span>
      </div>
      <Button type="button" size="sm" variant="outline" onClick={() => void exitImpersonation()}>
        Revenir en admin
      </Button>
    </div>
  );
};

export default ImpersonationBanner;
