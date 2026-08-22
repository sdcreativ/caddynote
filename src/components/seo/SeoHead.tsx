import { Helmet } from 'react-helmet-async';
import {
  absoluteAsset,
  absoluteUrl,
  DEFAULT_OG_IMAGE,
  DEFAULT_SEO,
} from '@/lib/seo';

type SeoHeadProps = {
  title?: string;
  description?: string;
  path?: string;
  image?: string;
  noIndex?: boolean;
  type?: 'website' | 'article';
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
};

/** Balises SEO / Open Graph / Twitter + JSON-LD optionnel. */
export function SeoHead({
  title = DEFAULT_SEO.title,
  description = DEFAULT_SEO.description,
  path = '/',
  image = DEFAULT_OG_IMAGE,
  noIndex = false,
  type = 'website',
  jsonLd,
}: SeoHeadProps) {
  const canonical = absoluteUrl(path);
  const ogImage = absoluteAsset(image);
  const siteName = 'CaddyNote';

  const schemas = jsonLd ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd]) : [];

  return (
    <Helmet prioritizeSeoTags>
      <html lang="fr" />
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonical} />
      {noIndex ? (
        <meta name="robots" content="noindex, nofollow" />
      ) : (
        <meta name="robots" content="index, follow" />
      )}

      <meta property="og:locale" content="fr_FR" />
      <meta property="og:type" content={type} />
      <meta property="og:site_name" content={siteName} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonical} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:image:alt" content={title} />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:site" content="@caddynote" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />

      <meta name="theme-color" content="#1D70D8" />

      {schemas.map((schema, i) => (
        <script key={i} type="application/ld+json">
          {JSON.stringify(schema)}
        </script>
      ))}
    </Helmet>
  );
}
