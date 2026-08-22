import { describe, it, expect, afterEach } from 'vitest';
import { render, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { RouteSeo } from './RouteSeo';

afterEach(() => {
  cleanup();
  // Helmet laisse parfois des balises du rendu précédent dans jsdom.
  document.head.querySelectorAll('meta[name="robots"], meta[property^="og:"], title').forEach((n) => n.remove());
});

const renderAt = (path: string) =>
  render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[path]}>
        <RouteSeo />
      </MemoryRouter>
    </HelmetProvider>
  );

describe('RouteSeo (OG / robots)', () => {
  it('pose un titre CaddyNote et robots index sur la home', async () => {
    renderAt('/');
    await waitFor(() => {
      expect(document.title).toMatch(/CaddyNote/);
    });
    await waitFor(() => {
      const robots = document.querySelector('meta[name="robots"]');
      expect(robots?.getAttribute('content') ?? '').toMatch(/index/);
    });
    const ogTitle = document.querySelector('meta[property="og:title"]');
    expect(ogTitle?.getAttribute('content') ?? '').toMatch(/CaddyNote/);
    const ogImage = document.querySelector('meta[property="og:image"]');
    expect(ogImage?.getAttribute('content') ?? '').toMatch(/og-caddynote/);
  });

  it('noindex les zones applicatives', async () => {
    renderAt('/dashboard');
    await waitFor(() => {
      expect(document.title).toMatch(/Espace connecté/);
    });
    await waitFor(() => {
      const robots = document.querySelector('meta[name="robots"]');
      expect(robots?.getAttribute('content') ?? '').toMatch(/noindex/);
    });
  });
});
