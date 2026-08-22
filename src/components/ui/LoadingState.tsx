import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface LoadingStateProps {
  label?: string;
  className?: string;
}

/** État de chargement homogène (listes / pages) — UX-005. */
export const LoadingState = ({ label, className }: LoadingStateProps) => {
  const { t } = useTranslation('app');
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 py-12 text-center text-muted-foreground ${className ?? ''}`}
      role="status"
      aria-live="polite"
    >
      <Loader2 className="h-8 w-8 animate-spin" aria-hidden="true" />
      <p className="text-sm">{label ?? t('loading.default')}</p>
    </div>
  );
};
