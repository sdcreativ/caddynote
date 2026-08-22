import ExcelJS from 'exceljs';
import type { CsvColumn } from './csvExport.js';

/**
 * RPT-002 : export XLSX réel, deuxième format sur les trois attendus par le
 * cahier des charges (CSV/XLSX/PDF) — le CSV seul a été traité le
 * 15/08/2026. Réutilise les mêmes définitions de colonnes que `toCsv`
 * (`CsvColumn<T>`) : un seul endroit décrit "quelles colonnes, avec quelle
 * valeur" par type de rapport, peu importe le format de sortie choisi.
 */
export const toXlsx = async <T>(sheetName: string, rows: T[], columns: CsvColumn<T>[]): Promise<Buffer> => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CaddyNote';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(sheetName.slice(0, 31)); // limite Excel : 31 caractères par nom d'onglet

  sheet.columns = columns.map((c) => ({ header: c.label, key: c.key, width: Math.max(c.label.length + 2, 12) }));
  sheet.getRow(1).font = { bold: true };

  for (const row of rows) {
    const values: Record<string, string | number | boolean | null> = {};
    for (const c of columns) {
      const v = c.value(row);
      values[c.key] = v === undefined ? null : v;
    }
    sheet.addRow(values);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
};
