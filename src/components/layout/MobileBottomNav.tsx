import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import {
  isNavHrefActive,
  mobileBottomNavForRole,
  type MobileBottomNavItem,
} from '@/lib/navConfig';

interface MobileBottomNavProps {
  role: string | null | undefined;
  onOpenMore: () => void;
}

/**
 * Barre de navigation inférieure — mobile uniquement (`lg:hidden`).
 * Slot « Plus » ouvre la sidebar pour le reste du métier (P2).
 */
const MobileBottomNav = ({ role, onOpenMore }: MobileBottomNavProps) => {
  const { t } = useTranslation('nav');
  const location = useLocation();
  const navigate = useNavigate();
  const items = mobileBottomNavForRole(role);

  if (!items?.length) return null;

  const handleItem = (item: MobileBottomNavItem) => {
    if (item.kind === 'more') {
      onOpenMore();
      return;
    }
    navigate(item.href);
  };

  return (
    <nav
      aria-label={t('bottomNav.label')}
      className="print-hidden fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/90 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_24px_-12px_rgba(15,23,42,0.18)] backdrop-blur-md lg:hidden"
    >
      <ul className="mx-auto flex h-[4.75rem] max-w-lg items-stretch justify-around px-1">
        {items.map((item) => {
          const Icon = item.icon;
          const label = t(item.titleKey);
          const active =
            item.kind === 'link'
              ? isNavHrefActive(location.pathname, item.href, location.search)
              : false;

          return (
            <li key={item.kind === 'link' ? item.href : item.titleKey} className="flex min-w-0 flex-1">
              <button
                type="button"
                onClick={() => handleItem(item)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex w-full flex-col items-center justify-center gap-0.5 rounded-xl px-0.5 py-2 text-[11px] font-semibold leading-tight transition-colors',
                  active ? 'text-blue-700' : 'text-slate-600 hover:text-slate-900'
                )}
              >
                <Icon
                  className={cn('h-5 w-5 shrink-0', active ? 'text-blue-600' : 'text-slate-500')}
                  aria-hidden
                />
                <span className="max-w-full px-0.5">{label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};

export default MobileBottomNav;
