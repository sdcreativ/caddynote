import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

type LegalInlineLinksProps = {
  className?: string;
  linkClassName?: string;
};

export function LegalInlineLinks({ className, linkClassName }: LegalInlineLinksProps) {
  const { t } = useTranslation('legal');

  return (
    <nav className={cn('inline-flex flex-wrap items-center gap-x-2 gap-y-1', className)} aria-label={t('legalNav')}>
      <Link to="/mentions-legales" className={linkClassName}>
        {t('links.notice')}
      </Link>
      <span aria-hidden="true">·</span>
      <Link to="/confidentialite" className={linkClassName}>
        {t('links.privacy')}
      </Link>
    </nav>
  );
}
