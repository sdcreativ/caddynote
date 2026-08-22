/**
 * UX-004 — contraste WCAG à partir des tokens HSL (`src/index.css`).
 * jsdom ne peint pas les couleurs : on calcule le ratio sur les triples
 * `H S% L%` déclarés, ce qui reste honnête pour les paires sémantiques
 * (texte sur fond de token). Un audit Lighthouse en rendu réel reste
 * nécessaire pour les overlays, images et couleurs hors tokens.
 */

export type HslTriple = [h: number, s: number, l: number];

export function parseHslTriple(value: string): HslTriple {
  const parts = value.replace(/%/g, '').trim().split(/\s+/).map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    throw new Error(`Triple HSL invalide : ${value}`);
  }
  return [parts[0], parts[1], parts[2]];
}

export function hslToRgb([h, s, l]: HslTriple): [number, number, number] {
  const sat = s / 100;
  const light = l / 100;
  const a = sat * Math.min(light, 1 - light);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (light - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)));
  };
  return [f(0), f(8), f(4)];
}

export function relativeLuminance(rgb: [number, number, number]): number {
  const lin = (c: number) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = rgb.map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Ratio de contraste WCAG 2 (1–21). */
export function contrastRatio(fgHsl: string, bgHsl: string): number {
  const L1 = relativeLuminance(hslToRgb(parseHslTriple(fgHsl)));
  const L2 = relativeLuminance(hslToRgb(parseHslTriple(bgHsl)));
  const [hi, lo] = L1 > L2 ? [L1, L2] : [L2, L1];
  return (hi + 0.05) / (lo + 0.05);
}

export function extractCssBlock(css: string, marker: ':root' | '.dark'): string {
  const i = css.indexOf(marker);
  if (i < 0) throw new Error(`Bloc CSS introuvable : ${marker}`);
  const open = css.indexOf('{', i);
  let depth = 0;
  for (let j = open; j < css.length; j += 1) {
    if (css[j] === '{') depth += 1;
    else if (css[j] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, j);
    }
  }
  throw new Error(`Bloc CSS non fermé : ${marker}`);
}

/** Map `--token` → valeur brute (triples HSL uniquement). */
export function extractHslTokens(css: string, marker: ':root' | '.dark'): Record<string, string> {
  const block = extractCssBlock(css, marker);
  const out: Record<string, string> = {};
  const re = /--([a-z0-9-]+):\s*([^;]+);/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block))) {
    const raw = m[2].trim();
    if (/linear-gradient/i.test(raw)) continue;
    if (!/^\d+(\.\d+)?\s+\d+(\.\d+)?%?\s+\d+(\.\d+)?%?$/.test(raw)) continue;
    out[m[1]] = raw;
  }
  return out;
}

/** Paires texte/fond sémantiques à garantir ≥ 4.5:1 (WCAG AA texte normal). */
export const AA_TEXT_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['foreground', 'background'],
  ['muted-foreground', 'background'],
  ['muted-foreground', 'muted'],
  ['primary-foreground', 'primary'],
  ['secondary-foreground', 'secondary'],
  ['accent-foreground', 'accent'],
  ['destructive-foreground', 'destructive'],
  ['success-foreground', 'success'],
  ['warning-foreground', 'warning'],
  ['info-foreground', 'info'],
  ['card-foreground', 'card'],
  ['popover-foreground', 'popover'],
];

/** Couleurs marketing hors tokens HSL (hex) — contrôle unitaire du ratio. */
export const BRAND_HEX_PAIRS: ReadonlyArray<{
  name: string;
  fg: string;
  bg: string;
  min?: number;
}> = [
  { name: 'navy #0B1F3A sur blanc', fg: '#0B1F3A', bg: '#FFFFFF' },
  { name: 'bleu #05335C sur blanc', fg: '#05335C', bg: '#FFFFFF' },
  { name: 'bleu CTA #1D70D8 sur blanc', fg: '#1D70D8', bg: '#FFFFFF' },
  { name: 'blanc sur navy #0B1F3A', fg: '#FFFFFF', bg: '#0B1F3A' },
  { name: 'blanc sur bleu #1D70D8', fg: '#FFFFFF', bg: '#1D70D8' },
];

export function hexToRgb(hex: string): [number, number, number] {
  const raw = hex.replace('#', '').trim();
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    throw new Error(`Hex invalide : ${hex}`);
  }
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

export function contrastRatioHex(fg: string, bg: string): number {
  const L1 = relativeLuminance(hexToRgb(fg));
  const L2 = relativeLuminance(hexToRgb(bg));
  const [hi, lo] = L1 > L2 ? [L1, L2] : [L2, L1];
  return (hi + 0.05) / (lo + 0.05);
}
