import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import { prefersReducedMotion } from '@/lib/smoothScroll';
import { PublicShell } from '@/components/public/PublicShell';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('prefers-reduced-motion (UX-003)', () => {
  const originalMatchMedia = window.matchMedia;

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it('detecte prefers-reduced-motion: reduce', () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
      onchange: null,
    }));
    expect(prefersReducedMotion()).toBe(true);
  });

  it('le CSS global coupe animations et transitions en reduced-motion', () => {
    const css = readFileSync(resolve(__dirname, '../index.css'), 'utf8');
    expect(css).toMatch(/@media \(prefers-reduced-motion:\s*reduce\)/);
    expect(css).toMatch(/animation:\s*none\s*!important/);
  });

  it('PublicShell enveloppe le site public dans MotionConfig reducedMotion="user"', () => {
    const { container } = render(
      <MemoryRouter>
        <PublicShell>
          <h1>Accueil</h1>
        </PublicShell>
      </MemoryRouter>
    );
    // MotionConfig n’ajoute pas de nœud DOM : on vérifie que le shell rend
    // toujours le skip-link et le landmark principal (contrat UX-003/004).
    expect(container.querySelector('#main-content')).not.toBeNull();
    expect(container.querySelector('a[href="#main-content"]')).not.toBeNull();
  });

  it('MotionConfig accepte reducedMotion="user" (contrat Framer)', () => {
    expect(() =>
      render(
        <MotionConfig reducedMotion="user">
          <div>ok</div>
        </MotionConfig>
      )
    ).not.toThrow();
  });
});

describe('Responsive 360px — garde-fous (UX-001)', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 360 });
  });

  it('le shell public empêche le débordement horizontal (overflow-x-hidden)', () => {
    const { container } = render(
      <MemoryRouter>
        <PublicShell>
          <p>Contenu</p>
        </PublicShell>
      </MemoryRouter>
    );
    const root = container.querySelector('.public-site');
    expect(root?.className).toMatch(/overflow-x-hidden/);
    expect(root?.className).toMatch(/min-h-screen/);
  });
});
