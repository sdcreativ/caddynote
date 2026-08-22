import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { contrastRatio, extractHslTokens, AA_TEXT_PAIRS, BRAND_HEX_PAIRS, contrastRatioHex } from './colorContrast';

const css = readFileSync(resolve(__dirname, '../index.css'), 'utf8');

describe('Tokens de contraste WCAG AA (UX-004)', () => {
  it.each([':root', '.dark'] as const)(
    '%s — paires sémantiques texte/fond ≥ 4.5:1',
    (theme) => {
      const tokens = extractHslTokens(css, theme);
      const missing: string[] = [];
      const failures: string[] = [];

      for (const [fg, bg] of AA_TEXT_PAIRS) {
        if (!tokens[fg] || !tokens[bg]) {
          missing.push(`${fg}/${bg}`);
          continue;
        }
        const ratio = contrastRatio(tokens[fg], tokens[bg]);
        if (ratio < 4.5) {
          failures.push(`${fg} sur ${bg} = ${ratio.toFixed(2)}:1`);
        }
      }

      expect(missing, `tokens absents (${theme})`).toEqual([]);
      expect(failures, `sous 4.5:1 (${theme})`).toEqual([]);
    }
  );
});

describe('Couleurs marque (hex marketing) ≥ 4.5:1', () => {
  it.each(BRAND_HEX_PAIRS)('$name', ({ fg, bg, min = 4.5 }) => {
    expect(contrastRatioHex(fg, bg)).toBeGreaterThanOrEqual(min);
  });
});
