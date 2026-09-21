import { Trans, useTranslation } from 'react-i18next';
import { FadeIn } from '@/components/public/FadeIn';
import { legalTransComponents } from '@/components/legal/legalLinks';
import { formatHostingLine, formatPublisherIdentity } from '@/lib/publicLegal';
import { usePublicVitrine } from '@/lib/publicVitrine';

type LegalSection = {
  title: string;
  body: string[];
  items?: string[];
};

type LegalDocumentProps = {
  kind: 'notice' | 'privacy';
};

const noticeParagraphs = (
  section: LegalSection,
  contact: { email: string; companyName: string; legalForm: string; shareCapital: string; registeredAddress: string; rccm: string; ncc: string },
  hostingLine: string
): string[] => {
  if (section.title === 'Éditeur') {
    const identity = formatPublisherIdentity(contact);
    return identity.length ? [section.body[0], ...identity].filter(Boolean) : section.body;
  }
  if (section.title === 'Hébergement') return [`${hostingLine}.`];
  if (section.title === 'Contact' && contact.email) {
    return [`E-mail : ${contact.email}. Vous pouvez aussi utiliser le formulaire de contact du site.`];
  }
  return section.body;
};

export function LegalDocument({ kind }: LegalDocumentProps) {
  const { t } = useTranslation('legal');
  const { contact, hosting } = usePublicVitrine();
  const sections = t(`${kind}.sections`, { returnObjects: true }) as LegalSection[];
  const hostingLine = formatHostingLine(hosting);

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
            {(kind === 'notice' ? noticeParagraphs(section, contact, hostingLine) : section.body).map(
              (paragraph) => (
                <p key={paragraph} className="text-sm leading-relaxed text-slate-600">
                  {paragraph}
                </p>
              )
            )}
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
