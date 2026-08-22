/**
 * RPT-002 : génération CSV réelle. `ExportsPage.tsx` simulait jusqu'ici tout
 * le cycle d'export (barre de progression avec `setTimeout`, toast "export
 * terminé") sans jamais produire le moindre fichier — `StrkReport` n'était
 * qu'un ticket de statut (`pending`/`processing`/`completed`) que rien ne
 * faisait jamais avancer. Volontairement synchrone (pas de file d'attente
 * de job) : les volumes réalistes d'un établissement scolaire tiennent sans
 * problème dans le cycle requête/réponse HTTP, et prétendre à un traitement
 * asynchrone qui n'existe pas serait la même malfaçon que celle corrigée ici.
 */

export interface CsvColumn<T> {
  key: string;
  label: string;
  value: (row: T) => string | number | boolean | null | undefined;
}

const escapeCsvField = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  const str = String(value);
  // RFC 4180 : un champ contenant un séparateur, un guillemet ou un saut de
  // ligne doit être entouré de guillemets, et tout guillemet interne doublé.
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

export const toCsv = <T>(rows: T[], columns: CsvColumn<T>[]): string => {
  const header = columns.map((c) => escapeCsvField(c.label)).join(',');
  const lines = rows.map((row) => columns.map((c) => escapeCsvField(c.value(row))).join(','));
  // BOM UTF-8 : Excel (destinataire le plus probable d'un export d'établissement
  // scolaire francophone) n'affiche correctement les accents sans lui.
  return '\uFEFF' + [header, ...lines].join('\r\n') + '\r\n';
};
