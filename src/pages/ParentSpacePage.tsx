import { Link, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Heart, Users, CreditCard, MessageSquare, ArrowRight, Shield } from 'lucide-react';
import { useStrkAuth } from '@/hooks/useStrkAuth';
import { PublicShell } from '@/components/public/PublicShell';
import { Button } from '@/components/ui/button';
import { FadeIn, Stagger, StaggerItem } from '@/components/public/FadeIn';

/**
 * Espace parent dédié — point d’entrée public + redirection si déjà connecté
 * en rôle parent vers /dashboard (cockpit famille).
 */
export default function ParentSpacePage() {
  const { user, isLoading } = useStrkAuth();
  const { t } = useTranslation('home');

  if (!isLoading && user?.role === 'parent') {
    return <Navigate to="/dashboard" replace />;
  }

  if (!isLoading && user) {
    return <Navigate to="/dashboard" replace />;
  }

  const highlights = [
    {
      icon: Users,
      title: 'Suivi multi-enfants',
      text: 'Un seul compte pour suivre notes, absences et documents de tous vos enfants.',
    },
    {
      icon: CreditCard,
      title: 'Paiements scolaires',
      text: 'Consultez les factures et le reste à payer, établissement par établissement.',
    },
    {
      icon: MessageSquare,
      title: 'Messages & alertes',
      text: 'Recevez les informations importantes de l’école sans multiplier les applications.',
    },
    {
      icon: Shield,
      title: 'Accès sécurisé',
      text: 'Droits par enfant (notes, présence, facturation) définis par l’établissement.',
    },
  ];

  return (
    <PublicShell>
      <main className="flex-1">
        <section className="relative isolate overflow-hidden px-4 pb-16 pt-14 sm:px-6 sm:pb-20 sm:pt-20">
          <div className="pointer-events-none absolute inset-0" aria-hidden>
            <div className="absolute -left-20 top-10 h-72 w-72 rounded-full bg-pink-200/30 blur-3xl" />
            <div className="absolute right-[-8%] top-0 h-80 w-80 rounded-full bg-[#1D70D8]/12 blur-3xl" />
          </div>

          <div className="relative mx-auto max-w-3xl text-center">
            <FadeIn>
              <p className="inline-flex items-center gap-1.5 rounded-full bg-[#E8F1FF] px-3 py-1 text-xs font-semibold text-[#05335C]">
                <Heart className="h-3.5 w-3.5" aria-hidden />
                Espace parent
              </p>
              <h1 className="mt-5 font-display text-4xl font-bold tracking-tight text-[#0B1F3A] sm:text-5xl">
                L’école de vos enfants,{' '}
                <span className="bg-gradient-to-r from-[#1D70D8] to-[#EC4899] bg-clip-text text-transparent">
                  toujours à portée
                </span>
              </h1>
              <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-slate-600">
                Consultez le parcours scolaire, justifiez une absence et suivez la scolarité en toute
                transparence — conçu pour les familles.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Button asChild size="lg" className="h-12 rounded-full bg-[#1D70D8] px-6 hover:bg-[#185CB4]">
                  <Link to="/sign">
                    Accéder à mon espace
                    <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="h-12 rounded-full">
                  <Link to="/aide/guide-parents">Guide familles</Link>
                </Button>
              </div>
            </FadeIn>
          </div>
        </section>

        <section className="border-t border-slate-100 bg-white px-4 py-16 sm:px-6">
          <div className="mx-auto max-w-5xl">
            <Stagger className="grid gap-5 sm:grid-cols-2">
              {highlights.map((item) => (
                <StaggerItem key={item.title}>
                  <article className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-6">
                    <item.icon className="h-5 w-5 text-[#1D70D8]" aria-hidden />
                    <h2 className="mt-4 text-lg font-bold text-slate-900">{item.title}</h2>
                    <p className="mt-2 text-sm leading-relaxed text-slate-500">{item.text}</p>
                  </article>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </section>
      </main>
    </PublicShell>
  );
}
