import type { ComponentType, ReactNode } from 'react';
import { FadeIn } from '@/components/public/FadeIn';

type GuideSectionProps = {
  id: string;
  icon: ComponentType<{ className?: string }>;
  title: ReactNode;
  children: ReactNode;
  first?: boolean;
};

/** Remplace le bloc `<section><h2/><Separator/>...</section>` répété dans
 * les 4 guides — un seul endroit pour l'espacement, l'icône et l'entrée en
 * fondu, cohérent avec le reste des pages publiques (AboutContent). Le
 * contenu métier de chaque guide (paragraphes, listes, `Alert`) reste
 * inchangé, seul l'habillage change. */
export function GuideSection({ id, icon: Icon, title, children, first = false }: GuideSectionProps) {
  return (
    <FadeIn
      className={
        first
          ? 'guide-section space-y-4'
          : 'guide-section space-y-4 mt-14 border-t border-slate-200 pt-10'
      }
    >
      <section aria-labelledby={id}>
        <h2 id={id} className="flex scroll-mt-24 items-center gap-3 text-2xl font-semibold tracking-tight text-slate-900">
          <Icon className="h-6 w-6 shrink-0 text-[#05335C]" aria-hidden="true" />
          {title}
        </h2>
        <div className="guide-prose mt-5 space-y-4 text-slate-600">{children}</div>
      </section>
    </FadeIn>
  );
}
