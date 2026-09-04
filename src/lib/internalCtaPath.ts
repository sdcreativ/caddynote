/** CTA bandeau public : chemin interne seulement (`/…`), pas d’URL externe ni `javascript:`. */
export const isInternalCtaPath = (url: string): boolean => {
  const trimmed = url.trim();
  if (!trimmed) return true;
  if (!trimmed.startsWith('/')) return false;
  if (trimmed.startsWith('//')) return false;
  if (/^[\\/]+[\\/]/.test(trimmed)) return false;
  if (trimmed.toLowerCase().includes('javascript:')) return false;
  return true;
};

export const sanitizeCtaUrl = (url: string | undefined, fallback: string): string => {
  if (url && isInternalCtaPath(url) && url.trim()) return url.trim();
  return isInternalCtaPath(fallback) ? fallback : '/';
};
