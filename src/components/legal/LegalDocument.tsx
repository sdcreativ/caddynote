import { Trans, useTranslation } from 'react-i18next';
import { FadeIn } from '@/components/public/FadeIn';
import { legalTransComponents } from '@/components/legal/legalLinks';

type LegalSection = {
  title: string;
  body: string[];
  items?: string[];
};

type LegalDocumentProps = {
  kind: 'notice' | 'privacy';
};

export function LegalDocument({ kind }: LegalDocumentProps) {
  const { t } = useTranslation('legal');
  const sections = t(`${kind}.sections`, { returnObjects: true }) as LegalSection[];

  return (
    <article className="space-y-10">
      <FadeIn>
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#05335C]">
          {t(`${kind}.eyebrow`)}
        </p>
        <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-[#0B1F3A] sm:text-4xl">
          {t(`${kind}.title`)}
        </h1>
        <p className="mt-2 text-sm text-slate-500">{t('updated')}</p>
        <p className="mt-5 text-lg leading-relaxed text-slate-600">{t(`${kind}.intro`)}</p>
      </FadeIn>

      <div className="space-y-8 border-t border-slate-200 pt-8">
        {sections.map((section) => (
          <section key={section.title} className="space-y-3">
            <h2 className="text-xl font-semibold tracking-tight text-[#0B1F3A]">{section.title}</h2>
            {section.body.map((paragraph) => (
              <p key={paragraph} className="text-sm leading-relaxed text-slate-600">
                {paragraph}
              </p>
            ))}
            {section.items?.length ? (
              <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-slate-600">
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
      </div>

      <p className="border-t border-slate-200 pt-6 text-sm leading-relaxed text-slate-600">
        <Trans
          ns="legal"
          i18nKey={`${kind}.seeOther`}
          components={legalTransComponents()}
        />
      </p>
    </article>
  );
}
