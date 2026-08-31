import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PUBLIC_BLUE } from '@/components/layout/PublicHeader';
import { cn } from '@/lib/utils';

/** Pages où la barre CTA est redondante (auth déjà au centre). */
const HIDDEN_ON = new Set(['/sign', '/signup', '/forgot-password', '/reset-password']);

/**
 * Barre fixe mobile — Connexion (icône) + Démo (CTA principal).
 * Masquée dès `lg` (header desktop suffit).
 */
export function PublicMobileCtaBar() {
  const { t } = useTranslation('publicHeader');
  const { pathname } = useLocation();

  if (HIDDEN_ON.has(pathname)) return null;

  return (
    <div className="print-hidden fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/90 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_28px_-12px_rgba(15,23,42,0.2)] backdrop-blur-md lg:hidden">
      <div className="mx-auto flex max-w-lg items-center gap-2.5 px-3 py-3">
        <Link
          to="/sign"
          aria-label={t('auth.login')}
          title={t('auth.login')}
          className={cn(
            'inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-slate-200',
            'bg-white text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-[#0B1F3A]'
          )}
        >
          <UserRound className="h-5 w-5" aria-hidden />
        </Link>
        <Link
          to="/contact?subject=Demande%20de%20d%C3%A9mo"
          className="inline-flex h-12 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-semibold leading-snug text-white transition hover:brightness-95 sm:text-base"
          style={{ backgroundColor: PUBLIC_BLUE }}
        >
          <span className="truncate">{t('auth.demo')}</span>
          <ArrowRight className="h-4 w-4 shrink-0 sm:h-5 sm:w-5" aria-hidden />
        </Link>
      </div>
    </div>
  );
}
