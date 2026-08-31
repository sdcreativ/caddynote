/**
 * Montants monétaires — parsing saisie FR + affichage.
 * Convention app : stockage en « centimes » (×100), y compris XOF
 * (CinetPay convertit via /100 vers l’unité principale).
 */

const ZERO_DECIMAL = new Set(['XOF', 'XAF', 'JPY', 'KRW']);

/** Libellé d’affichage (FCFA pour l’Afrique de l’Ouest/Centrale). */
export function currencyDisplayLabel(currency: string | null | undefined): string {
  const code = (currency || 'XOF').toUpperCase();
  if (code === 'XOF' || code === 'XAF') return 'FCFA';
  return code;
}

/**
 * Parse une saisie utilisateur d’un montant en unité principale.
 * Accepte : "12000", "12 000", "12.000", "12,5" (partie entière pour monnaies sans décimale).
 * Évite le piège JS : Number("12.000") === 12.
 */
export function parseMajorAmountInput(raw: string): number | null {
  let s = raw.trim().replace(/[\s\u00a0\u202f]/g, '');
  if (!s) return null;

  // Séparateurs de milliers style "12.000" / "12.000.000" (groupes de 3)
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '');
  } else if (/^\d{1,3}(,\d{3})+$/.test(s)) {
    s = s.replace(/,/g, '');
  } else if (s.includes(',') && s.includes('.')) {
    // 1.234,56 ou 1,234.56
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  }

  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/** Unité principale → centimes stockés. */
export function majorToCents(major: number): number {
  return Math.round(major * 100);
}

/** Centimes stockés → unité principale. */
export function centsToMajor(cents: number): number {
  return cents / 100;
}

/** Affiche un montant stocké en centimes (ex. 1_200_000 → « 12 000 FCFA »). */
export function formatCentsAmount(
  cents: number,
  currency: string | null | undefined = 'XOF'
): string {
  const major = centsToMajor(cents);
  const label = currencyDisplayLabel(currency);
  const code = (currency || 'XOF').toUpperCase();
  const digits = ZERO_DECIMAL.has(code) ? 0 : 2;
  const formatted = major.toLocaleString('fr-FR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return `${formatted} ${label}`;
}
