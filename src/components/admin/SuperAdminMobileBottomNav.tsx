import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Headphones,
  Building2,
  CreditCard,
  MoreHorizontal,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { usePlatformPermissions } from '@/hooks/usePlatformPermissions';

type BottomItem =
  | { kind: 'section'; section: string; titleKey: string; icon: LucideIcon }
  | { kind: 'more'; titleKey: string; icon: LucideIcon };

const BOTTOM_ITEMS: BottomItem[] = [
  { kind: 'section', section: 'overview', titleKey: 'items.overview', icon: LayoutDashboard },
  { kind: 'section', section: 'support-ops', titleKey: 'items.supportOps', icon: Headphones },
  { kind: 'section', section: 'institutions', titleKey: 'items.institutions', icon: Building2 },
  { kind: 'section', section: 'subscriptions', titleKey: 'items.subscriptions', icon: CreditCard },
  { kind: 'more', titleKey: 'bottomNav.more', icon: MoreHorizontal },
];

interface SuperAdminMobileBottomNavProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
  onOpenMore: () => void;
  demoRequestCount?: number;
}

/**
 * Barre ops mobile (`lg:hidden`) — 4 sections + « Plus » (ouvre le drawer).
 */
const SuperAdminMobileBottomNav = ({
  activeSection,
  onSectionChange,
  onOpenMore,
  demoRequestCount = 0,
}: SuperAdminMobileBottomNavProps) => {
  const { t } = useTranslation('superAdmin');
  const { canSeeSection } = usePlatformPermissions();

  const items = BOTTOM_ITEMS.filter((item) =>
    item.kind === 'more' ? true : canSeeSection(item.section)
  );

  if (items.length <= 1) return null;

  return (
    <nav
      aria-label={t('bottomNav.label')}
      className="print-hidden fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/90 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_24px_-12px_rgba(15,23,42,0.18)] backdrop-blur-md lg:hidden"
    >
      <ul className="mx-auto flex h-[4.75rem] max-w-lg items-stretch justify-around px-1">
        {items.map((item) => {
          const Icon = item.icon;
          const label = t(item.titleKey);
          const active = item.kind === 'section' && activeSection === item.section;
          const showBadge =
            item.kind === 'section' && item.section === 'support-ops' && demoRequestCount > 0;

          return (
            <li
              key={item.kind === 'section' ? item.section : 'more'}
              className="flex min-w-0 flex-1"
            >
              <button
                type="button"
                onClick={() => {
                  if (item.kind === 'more') {
                    onOpenMore();
                    return;
                  }
                  onSectionChange(item.section);
                }}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex w-full flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[13px] font-semibold leading-tight transition-colors',
                  active ? 'text-blue-700' : 'text-slate-600 hover:text-slate-900'
                )}
              >
                <span className="relative">
                  <Icon
                    className={cn('h-6 w-6 shrink-0', active ? 'text-blue-600' : 'text-slate-500')}
                    aria-hidden
                  />
                  {showBadge ? (
                    <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
                      {demoRequestCount > 99 ? '99+' : demoRequestCount}
                    </span>
                  ) : null}
                </span>
                <span className="max-w-full truncate px-0.5">{label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};

export default SuperAdminMobileBottomNav;
