import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { useStrkAuth } from '@/hooks/useStrkAuth';
import { PublicShell } from '@/components/public/PublicShell';
import { FadeIn, Stagger, StaggerItem } from '@/components/public/FadeIn';
import { HeroDashboardPreview } from '@/components/public/HeroDashboardPreview';
import { OfflinePhonePreview } from '@/components/public/OfflinePhonePreview';
import { TestimonialsSection } from '@/components/public/TestimonialsSection';
import { PresentationVideoModal } from '@/components/public/PresentationVideoModal';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { handleAnchorClick, scrollToHash } from '@/lib/smoothScroll';
import { FEATURES } from '@/data/features';
import { localizeFeature } from '@/i18n/localizeCatalog';
import { useTranslation } from 'react-i18next';
import { apiClient } from '@/lib/apiClient';
import {
  CheckCircle2,
  ArrowRight,
  Play,
  Bell,
  GraduationCap,
  CircleDollarSign,
  Shield,
  Landmark,
  Leaf,
  Building2,
  Briefcase,
  UserCheck,
  Users,
  Heart,
  Check,
  Sparkles,
} from 'lucide-react';

const BLUE = '#1D70D8';
const NAVY = '#0B1F3A';

const audienceLinks = [
  { key: 'schools' as const, icon: Building2, href: '/#roles' },
  { key: 'admins' as const, icon: Briefcase, href: '/aide/guide-admin' },
  { key: 'teachers' as const, icon: UserCheck, href: '/aide/guide-enseignants' },
  { key: 'families' as const, icon: Users, href: '/espace-parent' },
];

const roleTabs = [
  { id: 'directions' as const, icon: Building2, href: '/experiences/directions', stat: '100%', visual: 'gauge' as const },
  { id: 'enseignants' as const, icon: GraduationCap, href: '/experiences/enseignants', stat: '3×', visual: 'gauge' as const },
  { id: 'parents' as const, icon: Heart, href: '/experiences/parents', stat: '24/7', visual: 'toasts' as const },
];

const plansFallback = [
  { id: 'essentiel' as const, to: '/contact?subject=Offre%20Essentiel', featured: false },
  { id: 'performance' as const, to: '/contact?subject=Offre%20Performance', featured: true },
  { id: 'reseau' as const, to: '/contact?subject=Offre%20R%C3%A9seau', featured: false },
];

type PublicPlanCard = {
  id: string;
  name: string;
  description: string;
  features: string[];
  to: string;
  featured: boolean;
  priceLabel: string;
};

const partnerLabels = ['Groupe Avenir', 'Lycée Horizon', 'École Verte', 'Campus Nord', 'Institut Baobab'];

const Index = () => {
  const { user, isLoading } = useStrkAuth();
  const reduceMotion = useReducedMotion();
  const [showFallbackButton, setShowFallbackButton] = useState(false);
  const [role, setRole] = useState<(typeof roleTabs)[number]['id']>('directions');
  const [videoOpen, setVideoOpen] = useState(false);
  const [pricingPlans, setPricingPlans] = useState<PublicPlanCard[]>([]);
  const { t } = useTranslation('home');
  const activeRole = roleTabs.find((r) => r.id === role) ?? roleTabs[0];
  const featureCards = FEATURES.map((f) => {
    const loc = localizeFeature(f);
    return {
      icon: loc.icon,
      title: loc.title,
      text: loc.short,
      tone: loc.tone,
      to: `/fonctionnalites/${loc.slug}`,
    };
  });
  const fieldItems = t('field.items', { returnObjects: true }) as string[];

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { plans } = await apiClient.get<{
          plans: {
            id: string;
            name: string;
            features: Record<string, unknown> | string;
          }[];
        }>('/subscriptions/plans', { skipAuth: true });
        if (cancelled || !plans?.length) return;
        const mapped: PublicPlanCard[] = plans.map((p) => {
          const features =
            typeof p.features === 'string'
              ? (JSON.parse(p.features) as Record<string, unknown>)
              : p.features || {};
          return {
            id: p.id,
            name: p.name,
            description: String(features.description || ''),
            features: Array.isArray(features.featureList)
              ? (features.featureList as string[])
              : [],
            to: String(features.ctaPath || '/contact'),
            featured: Boolean(features.featured),
            priceLabel: String(features.priceLabel || t('pricing.onQuote')),
          };
        });
        setPricingPlans(mapped);
      } catch {
        // Repli i18n local si API indisponible
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  const displayPlans: PublicPlanCard[] =
    pricingPlans.length > 0
      ? pricingPlans
      : plansFallback.map((plan) => ({
          id: plan.id,
          name: t(`pricing.${plan.id}.name`),
          description: t(`pricing.${plan.id}.description`),
          features: t(`pricing.${plan.id}.features`, { returnObjects: true }) as string[],
          to: plan.to,
          featured: plan.featured,
          priceLabel:
            plan.id === 'reseau' ? t('pricing.custom') : t('pricing.onQuote'),
        }));

  useEffect(() => {
    if (user && window.location.pathname === '/') window.location.href = '/dashboard';
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const t = setTimeout(() => {
      if (window.location.pathname === '/') setShowFallbackButton(true);
    }, 2000);
    return () => clearTimeout(t);
  }, [user]);

  useEffect(() => {
    // Ne pas attendre la fin de l'auth pour les ancres : la page publique
    // s'affiche tout de suite (évite un écran « chargement » de plusieurs secondes).
    if (user) return;
    const { hash } = window.location;
    if (!hash) return;
    const t = window.setTimeout(() => scrollToHash(hash, false), 80);
    return () => window.clearTimeout(t);
  }, [user, isLoading]);

  // Visiteur authentifié : redirection dashboard (pas de page marketing).
  // Visiteur anonyme : contenu immédiat — ne jamais bloquer sur isLoading
  // (sinon une API lente / token périmé retarde tout le hero jusqu'à 3 s).
  if (user) {
    return (
      <div className="public-site flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="mb-4 text-slate-500">{t('redirecting')}</p>
          {showFallbackButton && (
            <Button asChild className="rounded-full" style={{ backgroundColor: BLUE }}>
              <Link to="/dashboard">{t('goDashboard')}</Link>
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <PublicShell>
      <PresentationVideoModal open={videoOpen} onOpenChange={setVideoOpen} />
      <main className="flex-1">
        {/* 1. Hero — maquette header/hero */}
        <section className="relative isolate overflow-hidden px-4 pb-12 pt-8 sm:px-6 sm:pb-20 sm:pt-16">
          <div className="pointer-events-none absolute inset-0" aria-hidden>
            <div className="absolute -left-24 top-0 h-80 w-80 rounded-full bg-[#1D70D8]/12 blur-3xl" />
            <div className="absolute right-[-5%] top-20 h-72 w-72 rounded-full bg-pink-200/30 blur-3xl" />
            <div className="absolute bottom-0 left-1/3 h-56 w-56 rounded-full bg-sky-200/35 blur-3xl" />
          </div>

          <div className="relative mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2 lg:gap-10 lg:gap-y-12">
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            >
              <p className="inline-flex items-center gap-1.5 rounded-full bg-[#E8F1FF] px-3 py-1 text-xs font-semibold text-[#05335C]">
                <Leaf className="h-3.5 w-3.5" aria-hidden />
                {t('hero.badge')}
              </p>

              <h1 className="mt-4 font-display text-[2.1rem] font-bold leading-[1.15] tracking-tight text-[#0B1F3A] sm:mt-5 sm:text-5xl sm:leading-tight lg:text-[3.4rem] lg:leading-[1.08]">
                {t('hero.titleLine1')}
                <br />
                <span className="bg-gradient-to-r from-[#1D70D8] to-[#7C3AED] bg-clip-text text-transparent">
                  {t('hero.titleAccent1')}
                </span>
                <span className="bg-gradient-to-r from-[#7C3AED] to-[#EC4899] bg-clip-text text-transparent">
                  {t('hero.titleAccent2')}
                </span>
              </h1>

              <p className="mt-4 max-w-lg text-[1.05rem] leading-relaxed text-slate-600 sm:mt-5 sm:text-lg">
                {t('hero.subtitle')}
              </p>

              <div className="mt-7 flex flex-col gap-3 sm:mt-8 sm:flex-row sm:items-center sm:gap-4">
                <Button
                  size="lg"
                  asChild
                  className="h-12 w-full rounded-full bg-[#1D70D8] px-6 text-base font-semibold text-white hover:bg-[#185CB4] sm:w-auto"
                >
                  <Link to="/contact">
                    {t('hero.ctaStart')}
                    <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
                  </Link>
                </Button>
                <button
                  type="button"
                  onClick={() => setVideoOpen(true)}
                  className="inline-flex h-11 items-center justify-center gap-2.5 text-sm font-semibold text-slate-800 transition hover:text-[#1D70D8] sm:h-auto sm:justify-start"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#E8F1FF] text-[#1D70D8] shadow-[0_0_0_4px_rgba(29,112,216,0.12)] transition group-hover:scale-105">
                    <Play className="h-3.5 w-3.5 fill-current" aria-hidden />
                  </span>
                  {t('hero.ctaVideo')}
                </button>
              </div>

              <ul className="mt-7 flex flex-col gap-2.5 sm:mt-9 sm:flex-row sm:flex-wrap sm:gap-x-7 sm:gap-y-3">
                {[
                  { icon: CheckCircle2, label: t('hero.trustSetup') },
                  { icon: Shield, label: t('hero.trustSecure') },
                  { icon: Landmark, label: t('hero.trustMoney') },
                ].map((item) => (
                  <li key={item.label} className="inline-flex items-center gap-2 text-sm font-medium text-slate-600">
                    <item.icon className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
                    {item.label}
                  </li>
                ))}
              </ul>
            </motion.div>

            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.04, ease: [0.22, 1, 0.36, 1] }}
            >
              <HeroDashboardPreview />
            </motion.div>
          </div>
        </section>

        {/* 2. Features — maquette « Tout est connecté » */}
        <section id="features" className="scroll-mt-32 bg-white px-4 pb-20 pt-6 sm:px-6 sm:pb-24 sm:pt-8">
          <div className="mx-auto max-w-6xl">
            <div className="mb-14 flex flex-col items-start justify-between gap-4 border-b border-slate-100 pb-6 sm:mb-16 sm:flex-row sm:items-center">
              <p className="max-w-md text-sm text-slate-500">
                {t('audience.intro')}
              </p>
              <nav className="flex flex-wrap items-center gap-x-5 gap-y-2" aria-label={t('audience.nav')}>
                {audienceLinks.map((item) => (
                  <a
                    key={item.key}
                    href={item.href}
                    onClick={(e) => handleAnchorClick(e, item.href)}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 transition-colors hover:text-[#1D70D8]"
                  >
                    <item.icon className="h-3.5 w-3.5 text-slate-600" aria-hidden />
                    {t(`audience.${item.key}`)}
                  </a>
                ))}
              </nav>
            </div>

            <FadeIn className="mx-auto max-w-2xl text-center">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#05335C]">
                {t('connected.eyebrow')}
              </p>
              <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-[2.5rem] sm:leading-[1.15]">
                {t('connected.title')}
                <br />
                <span className="text-slate-500">{t('connected.titleMuted')}</span>
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-slate-500 sm:text-lg">
                {t('connected.body')}
              </p>
            </FadeIn>

            <Stagger className="mt-14 grid gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
              {featureCards.map((card) => (
                <StaggerItem key={card.title}>
                  <article className="flex h-full flex-col rounded-2xl border border-slate-200/80 bg-white p-8 shadow-[0_2px_12px_rgba(15,23,42,0.04)]">
                    <div className={cn('flex h-11 w-11 items-center justify-center rounded-xl', card.tone)}>
                      <card.icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                    </div>
                    <h3 className="mt-5 text-[1.05rem] font-bold tracking-tight text-slate-900">{card.title}</h3>
                    <p className="mt-2.5 flex-1 text-sm leading-relaxed text-slate-500">{card.text}</p>
                    <Link
                      to={card.to}
                      className="mt-6 inline-flex items-center gap-1 text-sm font-semibold text-[#1D70D8] transition-colors hover:text-[#185CB4]"
                    >
                      {t('connected.more')}
                      <ArrowRight className="h-4 w-4" aria-hidden />
                    </Link>
                  </article>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </section>

        {/* Partners */}
        <section className="border-y border-slate-100 bg-white px-4 py-10 sm:px-6">
          <p className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
            {t('partners.eyebrow')}
          </p>
          <div className="mx-auto mt-6 flex max-w-4xl flex-wrap items-center justify-center gap-x-10 gap-y-4">
            {partnerLabels.map((name) => (
              <span
                key={name}
                className="text-sm font-bold tracking-wide text-slate-500"
                style={{ letterSpacing: '0.04em' }}
              >
                {name}
              </span>
            ))}
          </div>
        </section>

        {/* 3. Roles — maquette « Une expérience pour chacun » */}
        <section id="roles" className="scroll-mt-32 px-4 py-20 sm:px-6 sm:py-28" style={{ backgroundColor: NAVY }}>
          <div className="mx-auto max-w-5xl">
            <FadeIn className="mx-auto max-w-2xl text-center">
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#7EB6FF]">
                {t('roles.eyebrow')}
              </p>
              <h2 className="mt-4 font-display text-3xl font-bold tracking-tight text-white sm:text-[2.65rem] sm:leading-[1.15]">
                {t('roles.title')}
                <br />
                {t('roles.titleLine2')}
              </h2>
            </FadeIn>

            <div
              className="-mx-4 mt-10 flex snap-x snap-mandatory items-center gap-3 overflow-x-auto px-4 pb-1 sm:mx-auto sm:mt-10 sm:flex-wrap sm:justify-center sm:overflow-visible sm:px-0"
              role="tablist"
              aria-label={t('roles.tablist')}
            >
              {roleTabs.map((tab) => {
                const active = role === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setRole(tab.id)}
                    className={cn(
                      'inline-flex shrink-0 snap-start items-center gap-2 rounded-full border px-5 py-2.5 text-sm font-semibold transition-colors',
                      active
                        ? 'border-transparent bg-[#1D70D8] text-white shadow-[0_12px_32px_-8px_rgba(29,112,216,0.65)]'
                        : 'border-white/25 bg-transparent text-white/90 hover:border-white/45 hover:bg-white/5'
                    )}
                  >
                    <tab.icon className="h-4 w-4" strokeWidth={2} aria-hidden />
                    {t(`roles.${tab.id}.label`)}
                  </button>
                );
              })}
            </div>

            <motion.div
              key={activeRole.id}
              role="tabpanel"
              initial={reduceMotion ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="mt-10 overflow-hidden rounded-[1.75rem] border border-white/10 bg-gradient-to-br from-[#132A4A] via-[#0F2340] to-[#0B1F3A]"
            >
              <div className="grid items-center gap-8 p-6 sm:gap-10 sm:p-10 lg:grid-cols-[1.15fr_0.85fr] lg:gap-8 lg:p-12">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#7EB6FF]">
                    {t(`roles.${activeRole.id}.label`)}
                  </p>
                  <h3 className="mt-3 font-display text-2xl font-bold tracking-tight text-white sm:text-[1.85rem] sm:leading-snug">
                    {t(`roles.${activeRole.id}.title`)}
                  </h3>
                  <p className="mt-4 max-w-md text-[15px] leading-relaxed text-white/70">
                    {t(`roles.${activeRole.id}.body`)}
                  </p>
                  <Link
                    to={activeRole.href}
                    className="mt-7 inline-flex items-center gap-1.5 text-sm font-semibold text-[#7EB6FF] transition-colors hover:text-white"
                  >
                    {t('roles.cta')}
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </Link>
                </div>

                <div className="relative flex min-h-[220px] items-center justify-center">
                  {activeRole.visual === 'toasts' ? (
                    <div className="relative w-full max-w-xs space-y-4">
                      <motion.div
                        className="rounded-2xl border border-emerald-400/20 bg-white p-3.5 shadow-[0_20px_40px_-16px_rgba(0,0,0,0.45)]"
                        initial={reduceMotion ? false : { opacity: 0, x: -12 }}
                        animate={
                          reduceMotion
                            ? { opacity: 1 }
                            : { opacity: 1, x: 0, y: [0, -6, 0] }
                        }
                        transition={
                          reduceMotion
                            ? { duration: 0.2 }
                            : {
                                opacity: { duration: 0.4, delay: 0.15 },
                                x: { duration: 0.4, delay: 0.15 },
                                y: { duration: 3.4, repeat: Infinity, ease: 'easeInOut', delay: 0.5 },
                              }
                        }
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                            <Bell className="h-4 w-4" aria-hidden />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-bold text-slate-900">{t('roles.toastParentTitle')}</p>
                            <p className="text-[10px] text-slate-500">{t('roles.toastParentBody')}</p>
                          </div>
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                            <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
                          </span>
                        </div>
                      </motion.div>
                      <motion.div
                        className="ml-4 rounded-2xl border border-violet-400/20 bg-white p-3.5 shadow-[0_20px_40px_-16px_rgba(0,0,0,0.45)] sm:ml-8"
                        initial={reduceMotion ? false : { opacity: 0, x: 12 }}
                        animate={
                          reduceMotion
                            ? { opacity: 1 }
                            : { opacity: 1, x: 0, y: [0, -8, 0] }
                        }
                        transition={
                          reduceMotion
                            ? { duration: 0.2 }
                            : {
                                opacity: { duration: 0.4, delay: 0.3 },
                                x: { duration: 0.4, delay: 0.3 },
                                y: { duration: 3.8, repeat: Infinity, ease: 'easeInOut', delay: 0.8 },
                              }
                        }
                      >
                        <div className="flex items-start gap-2.5">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-600">
                            <CircleDollarSign className="h-4 w-4" aria-hidden />
                          </span>
                          <div className="min-w-0">
                            <p className="text-[11px] font-bold text-slate-900">{t('roles.toastPayTitle')}</p>
                            <p className="text-[10px] text-slate-500">{t('roles.toastPayBody')}</p>
                          </div>
                        </div>
                      </motion.div>
                    </div>
                  ) : (
                    <div className="relative flex h-52 w-52 items-center justify-center sm:h-56 sm:w-56">
                      <div
                        className="absolute inset-0 rounded-full border border-white/10"
                        aria-hidden
                      />
                      <div
                        className="absolute inset-5 rounded-full border border-white/15"
                        aria-hidden
                      />
                      <div
                        className="absolute inset-10 rounded-full border border-white/20"
                        aria-hidden
                      />
                      <div className="relative text-center">
                        <p className="font-display text-5xl font-bold tracking-tight text-white sm:text-6xl">
                          {activeRole.stat}
                        </p>
                        <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.18em] text-[#7EB6FF]">
                          {t(`roles.${activeRole.id}.statLabel`)}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* 4. Terrain — maquette offline / mobile */}
        <section className="bg-[#F4F6F9] px-4 py-16 sm:px-6 sm:py-20">
          <div className="mx-auto grid max-w-6xl items-center gap-10 rounded-[1.5rem] bg-white px-5 py-10 shadow-[0_24px_60px_-36px_rgba(15,23,42,0.18)] sm:gap-12 sm:rounded-[2rem] sm:px-10 sm:py-12 lg:grid-cols-2 lg:gap-16 lg:px-14 lg:py-16">
            <FadeIn>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#05335C]">
                {t('field.eyebrow')}
              </p>
              <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-[#0B1F3A] sm:text-[2.35rem] sm:leading-[1.15]">
                {t('field.title')}
                <br />
                {t('field.titleLine2')}
              </h2>
              <p className="mt-4 max-w-md text-[15px] leading-relaxed text-slate-500">
                {t('field.body')}
              </p>
              <ul className="mt-7 space-y-3.5">
                {fieldItems.map((line) => (
                  <li key={line} className="flex items-center gap-2.5 text-sm font-semibold text-slate-700">
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" aria-hidden />
                    {line}
                  </li>
                ))}
              </ul>
            </FadeIn>
            <FadeIn>
              <OfflinePhonePreview />
            </FadeIn>
          </div>
        </section>

        {/* 5. Pricing — maquette offres */}
        <section id="pricing" className="scroll-mt-32 bg-[#F7F8FA] px-4 py-20 sm:px-6 sm:py-28">
          <div className="mx-auto max-w-6xl">
            <FadeIn className="mx-auto max-w-2xl text-center">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#05335C]">
                {t('pricing.eyebrow')}
              </p>
              <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-[#0B1F3A] sm:text-[2.5rem] sm:leading-[1.15]">
                {t('pricing.title')}
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-slate-500">
                {t('pricing.body')}
              </p>
            </FadeIn>

            <Stagger className="mt-14 grid items-stretch gap-6 lg:grid-cols-3 lg:gap-7">
              {displayPlans.map((plan) => (
                <StaggerItem key={plan.id}>
                  <article
                    className={cn(
                      'group relative flex h-full flex-col rounded-[1.35rem] border bg-white p-8 transition duration-300 sm:p-9',
                      plan.featured
                        ? 'z-[1] border-[#1D70D8] shadow-[0_0_0_1px_rgba(29,112,216,0.12),0_28px_60px_-24px_rgba(29,112,216,0.45)] lg:-translate-y-2'
                        : 'border-slate-200/90 shadow-[0_12px_40px_-28px_rgba(15,23,42,0.35)] hover:-translate-y-1 hover:border-slate-300 hover:shadow-[0_20px_48px_-28px_rgba(15,23,42,0.4)]'
                    )}
                  >
                    {plan.featured ? (
                      <span className="absolute -top-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-[#1D70D8] px-3.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white shadow-[0_8px_20px_-6px_rgba(29,112,216,0.7)]">
                        <Sparkles className="h-3 w-3" aria-hidden />
                        {t('pricing.recommended')}
                      </span>
                    ) : null}

                    <div>
                      <h3 className="text-xl font-bold tracking-tight text-[#0B1F3A]">{plan.name}</h3>
                      <p className="mt-1.5 text-sm leading-snug text-slate-500">{plan.description}</p>
                    </div>

                    <p className="mt-7 font-display text-[2rem] font-bold tracking-tight text-[#0B1F3A]">
                      {plan.priceLabel}
                    </p>

                    <Link
                      to={plan.to}
                      className={cn(
                        'mt-6 inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-xl text-sm font-semibold transition-all duration-200',
                        plan.featured
                          ? 'bg-[#1D70D8] text-white shadow-[0_10px_24px_-10px_rgba(29,112,216,0.8)] hover:bg-[#0F5BB5] hover:shadow-[0_14px_28px_-10px_rgba(29,112,216,0.9)] active:bg-[#0B4FA0]'
                          : 'border border-slate-200 bg-white text-slate-800 hover:border-[#1D70D8]/40 hover:bg-[#E8F1FF] hover:text-[#1D70D8] active:bg-[#D6E6FF]'
                      )}
                    >
                      {t('pricing.choose')}
                      <ArrowRight className="h-4 w-4" aria-hidden />
                    </Link>

                    <div className="my-7 h-px bg-slate-100" aria-hidden />

                    <ul className="flex flex-1 flex-col gap-3.5">
                      {plan.features.map((f) => (
                        <li key={f} className="flex items-start gap-2.5 text-sm text-slate-600">
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                            <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
                          </span>
                          <span className="leading-snug">{f}</span>
                        </li>
                      ))}
                    </ul>
                  </article>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </section>

        {/* 6. Témoignages — carrousel premium */}
        <TestimonialsSection />

        {/* 7. Final CTA — maquette (bleu royal + halo) */}
        <section
          className="relative isolate overflow-hidden px-4 py-[4.5rem] sm:px-6 sm:py-28"
          style={{
            background:
              'radial-gradient(ellipse 70% 120% at 50% 40%, #225FBA 0%, #1858A0 32%, #0D3D82 62%, #09275D 100%)',
          }}
        >
          <div className="relative mx-auto max-w-[42rem] text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white">
              {t('cta.eyebrow')}
            </p>

            <h2 className="mt-4 font-display text-[1.85rem] font-bold leading-[1.2] tracking-tight text-white sm:text-[2.5rem] sm:leading-[1.18]">
              {t('cta.title')}
            </h2>

            <p className="mx-auto mt-4 max-w-lg text-[15px] leading-relaxed text-white sm:text-base">
              {t('cta.body')}
            </p>

            <div className="mt-9 flex w-full flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center sm:justify-center sm:gap-10">
              <Link
                to="/contact?subject=Demande%20de%20d%C3%A9monstration"
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-white px-6 text-[15px] font-semibold text-[#09275D] transition hover:bg-white/95 sm:w-auto"
              >
                {t('cta.demo')}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link
                to="/sign"
                className="inline-flex h-11 items-center justify-center text-[15px] font-semibold text-white transition hover:text-white/85"
              >
                {t('cta.explore')}
              </Link>
            </div>
          </div>
        </section>
      </main>
    </PublicShell>
  );
};

export default Index;
