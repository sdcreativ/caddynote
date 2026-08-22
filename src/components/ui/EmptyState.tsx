import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

/** État vide homogène pour listes / tableaux (UX transverse). */
export const EmptyState = ({ title, description, actionLabel, onAction }: EmptyStateProps) => {
  const { t } = useTranslation('app');
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <Inbox className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
      <div>
        <p className="font-medium">{title ?? t('empty.defaultTitle')}</p>
        <p className="mt-1 text-sm text-muted-foreground">{description ?? t('empty.defaultDescription')}</p>
      </div>
      {onAction && actionLabel && (
        <Button type="button" variant="outline" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
};
