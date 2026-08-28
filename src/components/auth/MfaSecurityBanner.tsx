import { ShieldCheck, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

type MfaSecurityBannerProps = {
  onEnable: () => void;
  onDismiss: () => void;
  /** ISO date de fin de grâce MFA (option A : 7 jours). */
  graceUntil?: string | null;
};

/** Bannière non bloquante pendant la grâce MFA (rôles sensibles). */
export function MfaSecurityBanner({ onEnable, onDismiss, graceUntil }: MfaSecurityBannerProps) {
  const { t } = useTranslation('nav');
  const deadline =
    graceUntil &&
    new Date(graceUntil).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

  return (
    <div
      role="status"
      className="mb-6 flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 items-start gap-3">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden />
        <div className="min-w-0">
          <p className="text-sm font-semibold">{t('mfaBanner.title')}</p>
          <p className="text-sm text-amber-900/80">
            {deadline ? t('mfaBanner.bodyWithDeadline', { date: deadline }) : t('mfaBanner.body')}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 self-end sm:self-center">
        <Button type="button" size="sm" onClick={onEnable}>
          {t('mfaBanner.cta')}
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-9 w-9 text-amber-900/70 hover:text-amber-950"
          onClick={onDismiss}
          aria-label={t('mfaBanner.dismiss')}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
