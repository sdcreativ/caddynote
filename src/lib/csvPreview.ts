/** Aperçu visuel d’un CSV (pas un parseur RFC 4180 — le serveur reste la source de vérité). */
export const previewCsvRows = (csv: string, maxRows = 8): string[][] =>
  csv
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .slice(0, maxRows)
    .map((line) => line.split(','));
