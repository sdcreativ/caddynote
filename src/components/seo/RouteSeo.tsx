import { useLocation } from 'react-router-dom';
import { SeoHead } from '@/components/seo/SeoHead';
import { buildBreadcrumbJsonLd, buildHomeJsonLd, buildSignupJsonLd } from '@/components/seo/jsonLd';
import { absoluteUrl, DEFAULT_SEO, PUBLIC_SEO_PAGES } from '@/lib/seo';
import { getFeatureBySlug } from '@/data/features';
import { getExperienceBySlug } from '@/data/experiences';

const APP_PREFIXES = [
  '/dashboard',
  '/institutions',
  '/students',
  '/absences',
  '/signatures',
  '/teaching',
  '/courses',
  '/calendar',
  '/admissions/admin',
  '/users',
  '/finance',
  '/documents',
  '/services',
  '/subscription',
  '/attendance',
  '/classes',
  '/teachers',
  '/my-courses',
  '/assignments',
  '/my-absences',
  '/my-grades',
  '/teacher-attendance',
  '/admin-dashboard',
  '/grades',
  '/messages',
  '/exports',
  '/support',
  '/assignment',
  '/teacher-assignments',
  '/teacher-exercises',
  '/subjects',
  '/super-admin',
  '/exercises',
  '/profile',
  '/settings',
  '/my-children',
  '/admin-login',
];

function isAppPath(pathname: string): boolean {
  if (pathname.startsWith('/admissions/suivi')) return true;
  return APP_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** SEO centralisé selon la route courante. */
export function RouteSeo() {
  const { pathname } = useLocation();
  const page = PUBLIC_SEO_PAGES.find((p) => p.path === pathname);

  if (page) {
    let jsonLd: Record<string, unknown> | Record<string, unknown>[] | undefined;

    if (pathname === '/') {
      jsonLd = buildHomeJsonLd();
    } else if (pathname === '/signup') {
      jsonLd = buildSignupJsonLd();
    } else if (pathname.startsWith('/fonctionnalites/')) {
      const slug = pathname.split('/')[2];
      const feature = getFeatureBySlug(slug);
      if (feature) {
        jsonLd = [
          buildBreadcrumbJsonLd([
            { name: 'Accueil', path: '/' },
            { name: feature.title, path: pathname },
          ]),
          {
            '@context': 'https://schema.org',
            '@type': 'WebPage',
            name: feature.title,
            description: feature.short,
            url: absoluteUrl(pathname),
          },
        ];
      }
    } else if (pathname.startsWith('/experiences/')) {
      const slug = pathname.split('/')[2];
      const experience = getExperienceBySlug(slug);
      if (experience) {
        jsonLd = [
          buildBreadcrumbJsonLd([
            { name: 'Accueil', path: '/' },
            { name: experience.label, path: pathname },
          ]),
        ];
      }
    }

    return (
      <SeoHead
        title={page.title}
        description={page.description}
        path={page.path}
        noIndex={page.noIndex}
        type={page.type}
        jsonLd={jsonLd}
      />
    );
  }

  if (isAppPath(pathname)) {
    return (
      <SeoHead
        title="CaddyNote — Espace connecté"
        description="Espace applicatif CaddyNote."
        path={pathname}
        noIndex
      />
    );
  }

  // 404 / routes inconnues
  return (
    <SeoHead
      title={`Page introuvable — ${DEFAULT_SEO.title}`}
      description={DEFAULT_SEO.description}
      path={pathname}
      noIndex
    />
  );
}
