import type { ComponentType } from 'react';
import { FadeIn } from '@/components/public/FadeIn';

type GuideHeroProps = {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
};

/** En-tête partagé des 4 guides (profil), aligné sur le style des autres
 * pages publiques (AboutContent, Index) plutôt que sur la mise en page
 * générique `prose` utilisée jusqu'ici. */
export function GuideHero({ icon: Icon, title, description }: GuideHeroProps) {
  return (
    <FadeIn className="mb-14 border-b border-slate-200 pb-10">
      <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[#05335C]/8 text-[#05335C]">
        <Icon className="h-7 w-7" aria-hidden="true" />
      </span>
      <h1 className="mt-5 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">{title}</h1>
      <p className="mt-4 max-w-2xl text-lg leading-relaxed text-slate-500">{description}</p>
    </FadeIn>
  );
}
