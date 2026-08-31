import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { resolveStoredFileDisplayUrl } from '@/lib/storedFileAccess';

type InstitutionBrandProps = {
  name: string;
  logoKey?: string | null;
  tagline?: string | null;
  to?: string;
  size?: number;
  className?: string;
  /** Masque le nom (logo / initiales seuls) — utile en navbar mobile. */
  hideName?: boolean;
  onClick?: () => void;
  'aria-label'?: string;
};

const initialsFromName = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'É';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
};

/**
 * En-tête shell établissement : logo uploadé, sinon initiales + nom.
 */
export function InstitutionBrand({
  name,
  logoKey,
  tagline = null,
  to = '/dashboard',
  size = 36,
  className,
  hideName = false,
  onClick,
  'aria-label': ariaLabel,
}: InstitutionBrandProps) {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const displayName = name.trim() || 'Établissement';

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    const run = async () => {
      if (!logoKey) {
        setLogoUrl(null);
        return;
      }
      if (
        logoKey.startsWith('http') ||
        logoKey.startsWith('blob:') ||
        logoKey.startsWith('/') ||
        logoKey.startsWith('data:')
      ) {
        setLogoUrl(logoKey);
        return;
      }
      try {
        const url = await resolveStoredFileDisplayUrl(logoKey);
        if (cancelled) {
          if (url.startsWith('blob:')) URL.revokeObjectURL(url);
          return;
        }
        objectUrl = url.startsWith('blob:') ? url : null;
        setLogoUrl(url);
      } catch {
        if (!cancelled) setLogoUrl(null);
      }
    };

    void run();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [logoKey]);

  const content = (
    <span className={cn('inline-flex min-w-0 max-w-full items-center gap-2.5', className)}>
      {logoUrl ? (
        <img
          src={logoUrl}
          alt=""
          width={size}
          height={size}
          className="shrink-0 rounded-lg object-contain"
          style={{ width: size, height: size }}
          decoding="async"
        />
      ) : (
        <span
          className="flex shrink-0 items-center justify-center rounded-lg bg-[#1D70D8] text-xs font-bold text-white"
          style={{ width: size, height: size }}
          aria-hidden
        >
          {initialsFromName(displayName)}
        </span>
      )}
      {!hideName ? (
        <span className="min-w-0 leading-tight">
          <span className="block truncate font-display text-[1.05rem] font-semibold tracking-tight text-[#0B1F3A]">
            {displayName}
          </span>
          {tagline ? (
            <span className="block truncate text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              {tagline}
            </span>
          ) : null}
        </span>
      ) : null}
    </span>
  );

  if (!to) {
    return content;
  }

  return (
    <Link to={to} className="min-w-0" aria-label={ariaLabel || displayName} onClick={onClick}>
      {content}
    </Link>
  );
}
