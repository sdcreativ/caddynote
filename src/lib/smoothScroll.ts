import type { MouseEvent } from 'react';

/** Défilement doux vers une ancre, en respectant prefers-reduced-motion. */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const HEADER_OFFSET = 120;

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function animateScrollTo(targetY: number): void {
  const startY = window.scrollY;
  const diff = targetY - startY;
  if (Math.abs(diff) < 2) return;

  const duration = Math.min(1100, Math.max(480, Math.abs(diff) * 0.42));
  const start = performance.now();

  const step = (now: number) => {
    const t = Math.min(1, (now - start) / duration);
    window.scrollTo(0, startY + diff * easeInOutCubic(t));
    if (t < 1) requestAnimationFrame(step);
  };

  requestAnimationFrame(step);
}

export function scrollToHash(hash: string, replaceUrl = true): boolean {
  const id = hash.replace(/^#/, '');
  if (!id) return false;
  const el = document.getElementById(id);
  if (!el) return false;

  const top = el.getBoundingClientRect().top + window.scrollY - HEADER_OFFSET;

  if (prefersReducedMotion()) {
    window.scrollTo(0, top);
  } else {
    animateScrollTo(top);
  }

  if (replaceUrl) {
    const next = `${window.location.pathname}${window.location.search}#${id}`;
    window.history.replaceState(null, '', next);
  }
  return true;
}

/** Intercepte un clic sur lien d’ancre (même page ou `/#id`). */
export function handleAnchorClick(event: MouseEvent<HTMLAnchorElement>, href: string): void {
  const url = new URL(href, window.location.origin);
  const isHome = url.pathname === '/' || url.pathname === '';
  const hash = url.hash;
  if (!isHome || !hash) return;

  const onHome = window.location.pathname === '/' || window.location.pathname === '';
  if (!onHome) return;

  event.preventDefault();
  scrollToHash(hash);
}
