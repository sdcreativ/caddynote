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
        'Plateforme de gestion scolaire pour les établissements scolaires.',
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
        priceCurrency: 'XOF',
        description: 'Tarification sur devis pour les établissements scolaires',
        url: absoluteUrl('/contact'),
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

/** JSON-LD page « obtenir un compte » (pas d’inscription libre). */
export function buildSignupJsonLd() {
  const url = absoluteUrl('/signup');
  return [
    buildBreadcrumbJsonLd([
      { name: 'Accueil', path: '/' },
      { name: 'Obtenir un compte', path: '/signup' },
    ]),
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: 'Obtenir un compte CaddyNote',
      description:
        'Les comptes CaddyNote sont créés par l’établissement : espaces élève et parent séparés, identifiants remis par la direction.',
      url,
      inLanguage: 'fr',
    },
  ];
}
