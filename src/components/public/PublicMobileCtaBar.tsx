import { Link, useLocation } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PUBLIC_BLUE } from '@/components/layout/PublicHeader';

/** Pages où la barre CTA est redondante (auth déjà au centre). */
const HIDDEN_ON = new Set(['/sign', '/signup', '/forgot-password', '/reset-password']);

/**
 * Barre fixe mobile — Connexion + Démo (actions publiques essentielles).
 * Masquée dès `lg` (header desktop suffit).
 */
export function PublicMobileCtaBar() {
  const { t } = useTranslation('publicHeader');
  const { pathname } = useLocation();

  if (HIDDEN_ON.has(pathname)) return null;

  return (
    <div className="print-hidden fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/90 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_28px_-12px_rgba(15,23,42,0.2)] backdrop-blur-md lg:hidden">
      <div className="mx-auto flex max-w-lg gap-2.5 px-3 py-3">
        <Link
          to="/sign"
          className="flex h-12 flex-1 items-center justify-center rounded-full border border-slate-200 text-base font-semibold text-[#0B1F3A] transition hover:bg-slate-50"
        >
          {t('auth.login')}
        </Link>
        <Link
          to="/contact?subject=Demande%20de%20d%C3%A9mo"
          className="inline-flex h-12 flex-[1.15] items-center justify-center gap-1.5 rounded-full text-base font-semibold text-white transition hover:brightness-95"
          style={{ backgroundColor: PUBLIC_BLUE }}
        >
          {t('auth.demo')}
          <ArrowRight className="h-5 w-5 shrink-0" aria-hidden />
        </Link>
      </div>
    </div>
  );
}
