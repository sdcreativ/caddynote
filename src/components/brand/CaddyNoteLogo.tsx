import { Link, NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { BRAND } from '@/lib/brand';

type CaddyNoteLogoProps = {
  withWordmark?: boolean;
  tagline?: string | null;
  size?: number;
  className?: string;
  linkClassName?: string;
  to?: string;
  nav?: boolean;
  'aria-label'?: string;
  /** Fond sombre : C blanc (sidebar app / footer) */
  inverted?: boolean;
  onClick?: () => void;
};

/**
 * Monogramme CN imbriqué (C blanc/navy devant, N bleu derrière) — même marque que la vidéo.
 */
export function CaddyNoteMark({
  size = 32,
  className,
  inverted = false,
}: {
  size?: number;
  className?: string;
  inverted?: boolean;
}) {
  return (
    <img
      src={inverted ? BRAND.markDark : BRAND.markLight}
      alt=""
      width={size}
      height={size}
      className={cn('shrink-0 object-contain', className)}
      decoding="async"
    />
  );
}

export function CaddyNoteLogo({
  withWordmark = true,
  tagline = null,
  size = 36,
  className,
  linkClassName,
  to,
  nav = false,
  inverted = false,
  onClick,
  'aria-label': ariaLabel = `${BRAND.name} — Accueil`,
}: CaddyNoteLogoProps) {
  const content = (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <CaddyNoteMark size={size} inverted={inverted} />
      {withWordmark ? (
        <span className="leading-tight">
          <span
            className={cn(
              'block font-display text-[1.05rem] font-bold tracking-tight',
              inverted ? 'text-white' : 'text-[#0B1F3A]'
            )}
          >
            {BRAND.name}
          </span>
          {tagline ? (
            <span
              className={cn(
                'block text-[9px] font-semibold uppercase tracking-[0.14em]',
                inverted ? 'text-white/80' : 'text-slate-600'
              )}
            >
              {tagline}
            </span>
          ) : null}
        </span>
      ) : null}
    </span>
  );

  if (!to) return content;

  const linkClass = cn(
    'group rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-[#1D70D8]/40',
    !inverted && withWordmark && '[&_.font-display]:transition [&_.font-display]:group-hover:text-[#1D70D8]',
    '[&_img]:transition [&_img]:group-hover:scale-[1.03]',
    linkClassName
  );

  if (nav) {
    return (
      <NavLink to={to} className={linkClass} aria-label={ariaLabel} onClick={onClick}>
        {content}
      </NavLink>
    );
  }

  return (
    <Link to={to} className={linkClass} aria-label={ariaLabel} onClick={onClick}>
      {content}
    </Link>
  );
}
