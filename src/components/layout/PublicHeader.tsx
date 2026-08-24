import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { ArrowRight, MenuIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CaddyNoteLogo } from '@/components/brand/CaddyNoteLogo';
import { BRAND } from '@/lib/brand';
import { cn } from '@/lib/utils';
import { handleAnchorClick } from '@/lib/smoothScroll';
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useTranslation } from 'react-i18next';

const BLUE = '#1D70D8';
const ANNOUNCE_BG = '#0B1F3A';

function BrandMark({ inverted = false }: { inverted?: boolean }) {
  return (
    <CaddyNoteLogo
      to="/"
      nav
      inverted={inverted}
      tagline={BRAND.taglinePublic}
      size={36}
    />
  );
}

function DesktopNavLink({
  label,
  href,
  to,
  hash,
  activeHash,
}: {
  label: string;
  href?: string;
  to?: string;
  hash?: string;
  activeHash: string;
}) {
  const location = useLocation();
  const isRouteActive = Boolean(to && location.pathname === to);
  const isHashActive = Boolean(hash && location.pathname === '/' && activeHash === hash);
  const active = isRouteActive || isHashActive;

  const className = cn(
    'inline-flex h-9 items-center rounded-full px-3.5 text-sm font-medium transition-all duration-200',
    active
      ? 'bg-white text-[#0B1F3A] shadow-sm'
      : 'text-slate-500 hover:bg-white/70 hover:text-[#0B1F3A]'
  );

  if (to) {
    return (
      <NavLink to={to} className={className}>
        {label}
      </NavLink>
    );
  }

  return (
    <a href={href} onClick={(e) => href && handleAnchorClick(e, href)} className={className}>
      {label}
    </a>
  );
}

export function PublicHeader() {
  const { t } = useTranslation('publicHeader');
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [activeHash, setActiveHash] = useState(() => location.hash.replace('#', '') || '');

  const navItems = [
    { key: 'features', label: t('nav.features'), href: '/#features', hash: 'features' },
    { key: 'solutions', label: t('nav.solutions'), href: '/#roles', hash: 'roles' },
    { key: 'pricing', label: t('nav.pricing'), href: '/#pricing', hash: 'pricing' },
    { key: 'admissions', label: t('nav.admissions'), to: '/admissions' },
    { key: 'about', label: t('nav.about'), to: '/about' },
  ] as const;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setActiveHash(location.hash.replace('#', ''));
  }, [location.hash]);

  useEffect(() => {
    if (location.pathname !== '/') {
      setActiveHash('');
      return;
    }

    const ids = ['features', 'roles', 'pricing'] as const;
    const els = ids.map((id) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
    if (!els.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target?.id) setActiveHash(visible.target.id);
      },
      { rootMargin: '-30% 0px -55% 0px', threshold: [0.1, 0.25, 0.5] }
    );

    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [location.pathname]);

  return (
    <header className="sticky top-0 z-50">
      {/* Annonce */}
      <div className="text-white" style={{ backgroundColor: ANNOUNCE_BG }}>
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-center gap-1 px-4 py-2 text-center text-xs sm:flex-row sm:gap-5 sm:px-6 sm:text-[13px]">
          <p className="line-clamp-2 font-medium text-white/90 sm:line-clamp-none">
            <span className="sm:hidden">{t('announceShort')}</span>
            <span className="hidden sm:inline">{t('announce')}</span>
          </p>
          <Link
            to="/contact?subject=Demande%20de%20pr%C3%A9sentation"
            className="inline-flex items-center gap-1 font-semibold text-[#7EB6FF] transition hover:text-white"
          >
            {t('announceCta')}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      </div>

      {/* Nav */}
      <div
        className={cn(
          'border-b bg-white/95 backdrop-blur-md transition-[box-shadow,border-color] duration-300',
          scrolled
            ? 'border-slate-200/90 shadow-[0_8px_30px_-12px_rgba(15,23,42,0.18)]'
            : 'border-slate-200/60 shadow-none'
        )}
      >
        <div className="mx-auto flex h-[4.25rem] max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <BrandMark />

          <nav
            className="hidden items-center gap-0.5 rounded-full bg-slate-50/80 px-1.5 py-1 lg:flex"
            aria-label={t('ariaNav')}
          >
            {navItems.map((item) =>
              'to' in item ? (
                <DesktopNavLink
                  key={item.key}
                  label={item.label}
                  to={item.to}
                  activeHash={activeHash}
                />
              ) : (
                <DesktopNavLink
                  key={item.key}
                  label={item.label}
                  href={item.href}
                  hash={item.hash}
                  activeHash={activeHash}
                />
              )
            )}
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <NavLink
              to="/sign"
              className={({ isActive }) =>
                cn(
                  'inline-flex h-10 items-center rounded-full px-3 text-sm font-semibold transition sm:px-3.5',
                  isActive
                    ? 'bg-slate-100 text-[#0B1F3A]'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-[#0B1F3A]'
                )
              }
            >
              {t('auth.login')}
            </NavLink>
            <Button
              asChild
              className="hidden h-10 rounded-full px-5 text-sm font-semibold text-white shadow-[0_8px_20px_-8px_rgba(29,112,216,0.65)] transition-all duration-200 hover:brightness-95 hover:shadow-[0_12px_24px_-8px_rgba(29,112,216,0.75)] sm:inline-flex"
              style={{ backgroundColor: BLUE }}
            >
              <Link to="/contact?subject=Demande%20de%20d%C3%A9mo">
                {t('auth.demo')}
                <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden />
              </Link>
            </Button>

            <div className="lg:hidden">
              <Sheet>
                <SheetTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-full border border-slate-200/80 bg-white hover:bg-slate-50"
                    aria-label={t('ariaMenu')}
                  >
                    <MenuIcon className="h-5 w-5 text-[#0B1F3A]" />
                  </Button>
                </SheetTrigger>
                <SheetContent
                  side="right"
                  className="w-[min(100%,20rem)] border-l-0 p-0 text-white [&>button]:right-5 [&>button]:top-5 [&>button]:rounded-full [&>button]:bg-white/10 [&>button]:p-2 [&>button]:opacity-100 [&>button]:ring-offset-0 [&>button]:hover:bg-white/15 [&>button]:hover:opacity-100 [&>button]:focus:ring-white/30"
                  style={{ backgroundColor: ANNOUNCE_BG }}
                >
                  <SheetTitle className="sr-only">{t('ariaMenu')}</SheetTitle>
                  <div className="flex h-full flex-col">
                    <div className="border-b border-white/10 px-5 py-5 pr-14">
                      <BrandMark inverted />
                    </div>

                    <nav className="flex-1 space-y-1 px-3 py-5">
                      {navItems.map((item) =>
                        'to' in item ? (
                          <SheetClose asChild key={item.key}>
                            <NavLink
                              to={item.to}
                              className="block rounded-xl px-3 py-3 text-base font-medium text-white/90 transition hover:bg-white/10"
                            >
                              {item.label}
                            </NavLink>
                          </SheetClose>
                        ) : (
                          <SheetClose asChild key={item.key}>
                            <a
                              href={item.href}
                              onClick={(e) => handleAnchorClick(e, item.href)}
                              className="block rounded-xl px-3 py-3 text-base font-medium text-white/90 transition hover:bg-white/10"
                            >
                              {item.label}
                            </a>
                          </SheetClose>
                        )
                      )}
                    </nav>

                    <div className="space-y-2 border-t border-white/10 px-5 py-5">
                      <SheetClose asChild>
                        <NavLink
                          to="/sign"
                          className="flex h-11 items-center justify-center rounded-full border border-white/20 text-sm font-semibold text-white transition hover:bg-white/10"
                        >
                          {t('auth.login')}
                        </NavLink>
                      </SheetClose>
                      <SheetClose asChild>
                        <Link
                          to="/contact?subject=Demande%20de%20d%C3%A9mo"
                          className="flex h-11 items-center justify-center gap-1.5 rounded-full text-sm font-semibold text-white transition hover:brightness-95"
                          style={{ backgroundColor: BLUE }}
                        >
                          {t('auth.demo')}
                          <ArrowRight className="h-4 w-4" aria-hidden />
                        </Link>
                      </SheetClose>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

export { BLUE as PUBLIC_BLUE, ANNOUNCE_BG as PUBLIC_NAVY };
