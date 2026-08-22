import { absoluteUrl, getSiteUrl } from '@/lib/seo';

/** Schema.org Organization + SoftwareApplication pour la home. */
export function buildHomeJsonLd() {
  const url = getSiteUrl();
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'CaddyNote',
      url,
      logo: absoluteUrl('/logo-cn-light.png'),
      email: 'contact@caddynote.com',
      description:
        'Plateforme de gestion scolaire pour les établissements francophones en Afrique et en Europe.',
      sameAs: [],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'CaddyNote',
      applicationCategory: 'EducationalApplication',
      operatingSystem: 'Web',
      url,
      description:
        'Gestion scolaire : présences, notes, paiements Mobile Money, documents et communication familles.',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'EUR',
        description: 'Démonstration et devis sur demande',
      },
      inLanguage: 'fr',
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'CaddyNote',
      url,
      inLanguage: 'fr',
    },
  ];
}

export function buildBreadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

/** JSON-LD page inscription / essai gratuit. */
export function buildSignupJsonLd() {
  const url = absoluteUrl('/signup');
  return [
    buildBreadcrumbJsonLd([
      { name: 'Accueil', path: '/' },
      { name: 'Créer un compte', path: '/signup' },
    ]),
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: 'Essai gratuit 30 jours — Créer un compte CaddyNote',
      description:
        'Créez votre compte CaddyNote et profitez de 30 jours d’essai gratuit sans carte bancaire.',
      url,
      inLanguage: 'fr',
    },
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'CaddyNote',
      applicationCategory: 'EducationalApplication',
      operatingSystem: 'Web',
      url: getSiteUrl(),
      offers: {
        '@type': 'Offer',
        name: 'Essai gratuit 30 jours',
        price: '0',
        priceCurrency: 'XOF',
        description: 'Accès complet pendant 30 jours, sans engagement ni carte bancaire.',
        url,
      },
    },
  ];
}
