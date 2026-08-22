import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

/** État d’erreur homogène avec action de nouvel essai — UX-005. */
export const ErrorState = ({ title, description, onRetry, retryLabel, className }: ErrorStateProps) => {
  const { t } = useTranslation('app');
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 py-12 text-center ${className ?? ''}`}
      role="alert"
    >
      <AlertTriangle className="h-10 w-10 text-destructive" aria-hidden="true" />
      <div>
        <p className="font-medium">{title ?? t('error.defaultTitle')}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {description ?? t('error.defaultDescription')}
        </p>
      </div>
      {onRetry && (
        <Button type="button" variant="outline" onClick={onRetry}>
          {retryLabel ?? t('error.retry')}
        </Button>
      )}
    </div>
  );
};
