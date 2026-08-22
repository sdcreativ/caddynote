/**
 * ELV-005 : lecture CSV réelle (miroir de `csvExport.ts`). Analyseur RFC 4180
 * écrit à la main plutôt qu'une dépendance externe (`papaparse`...) : le
 * format à supporter est simple (champs entre guillemets, virgules/retours
 * à la ligne échappés) et ça évite d'ajouter une dépendance juste pour ça.
 */

/** Découpe un texte CSV en lignes de champs bruts (pas d'en-tête). */
export const parseCsv = (text: string): string[][] => {
  // Retire le BOM UTF-8 éventuel (généré par toCsv/Excel).
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  while (i < input.length) {
    const char = input[i];
    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += char;
      i++;
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (char === ',') {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (char === '\r') {
      i++;
      continue;
    }
    if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
      continue;
    }
    field += char;
    i++;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Ignore les lignes vides (fin de fichier avec retour à la ligne final, ex.).
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ''));
};

/** Même chose, mais en objets `{ colonne: valeur }` à partir de la première
 * ligne comme en-tête — c'est ce que les appelants utilisent en pratique. */
export const parseCsvWithHeader = (text: string): Record<string, string>[] => {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    header.forEach((h, idx) => {
      obj[h] = (r[idx] ?? '').trim();
    });
    return obj;
  });
};
