import { describe, it, expect } from 'vitest';
import browserslist from 'browserslist';
import browserslistToEsbuild from 'browserslist-to-esbuild';

/**
 * NFR-007 — cibles Chrome / Firefox / Safari / Chrome Android.
 * Pas un test sur device réel (hors labo) : vérifie que browserslist
 * déclare bien ces familles et que Vite peut en dériver un `build.target`.
 */
describe('Cibles navigateurs (NFR-007)', () => {
  const resolved = browserslist();

  it('résout Chrome, Firefox, Safari et Chrome Android', () => {
    expect(resolved.some((b) => b.startsWith('chrome '))).toBe(true);
    expect(resolved.some((b) => b.startsWith('firefox '))).toBe(true);
    expect(resolved.some((b) => b.startsWith('safari '))).toBe(true);
    expect(resolved.some((b) => b.startsWith('chromeandroid ') || b.startsWith('and_chr '))).toBe(true);
  });

  it('exclut Opera Mini et les navigateurs morts', () => {
    expect(resolved.some((b) => b.startsWith('op_mini'))).toBe(false);
    expect(resolved.length).toBeGreaterThan(4);
  });

  it('produit des cibles esbuild non vides pour le build Vite', () => {
    const targets = browserslistToEsbuild();
    expect(targets.length).toBeGreaterThan(0);
    expect(targets.every((t) => typeof t === 'string' && t.length > 0)).toBe(true);
  });
});
