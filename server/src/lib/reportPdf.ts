import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

/**
 * RPT-002 : export PDF réel, troisième et dernier format attendu par le
 * cahier des charges (CSV/XLSX/PDF). Rendu tabulaire générique — pas de
 * mise en page par type de rapport, une seule grille titre + en-têtes +
 * lignes, paginée automatiquement. Volontairement simple : `pdf.ts` gère
 * déjà la mise en page riche (logo, filigrane, QR...) pour les documents
 * officiels DOC-001/002, un besoin distinct d'un export de données
 * tabulaires — dupliquer cette richesse ici serait hors sujet.
 */

const PAGE_WIDTH = 841.89; // A4 paysage, en points — plus de largeur utile pour un tableau
const PAGE_HEIGHT = 595.28;
const MARGIN = 40;
const ROW_HEIGHT = 20;
const HEADER_HEIGHT = 24;
const FONT_SIZE = 9;

export interface ReportPdfTable {
  title: string;
  generatedAt: Date;
  columns: string[];
  /** Chaque ligne déjà convertie en chaînes affichables (une valeur par colonne, même ordre). */
  rows: string[][];
}

/** Tronque avec une ellipse si le texte dépasse la largeur de colonne disponible. */
const fitText = (text: string, maxWidth: number, font: Awaited<ReturnType<PDFDocument['embedFont']>>, size: number): string => {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let truncated = text;
  while (truncated.length > 1 && font.widthOfTextAtSize(truncated + '…', size) > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return truncated + '…';
};

export const renderTablePdf = async (table: ReportPdfTable): Promise<Uint8Array> => {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const usableWidth = PAGE_WIDTH - 2 * MARGIN;
  const colWidth = usableWidth / Math.max(table.columns.length, 1);
  const gray = rgb(0.4, 0.4, 0.4);
  const headerBg = rgb(0.93, 0.93, 0.93);

  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  const drawTitle = () => {
    page.drawText(table.title, { x: MARGIN, y, size: 16, font: boldFont });
    y -= 20;
    page.drawText(`Généré le ${table.generatedAt.toLocaleString('fr-FR')}`, { x: MARGIN, y, size: 9, font, color: gray });
    y -= 24;
  };

  const drawHeaderRow = () => {
    page.drawRectangle({ x: MARGIN, y: y - HEADER_HEIGHT + 6, width: usableWidth, height: HEADER_HEIGHT, color: headerBg });
    table.columns.forEach((label, i) => {
      const text = fitText(label, colWidth - 6, boldFont, FONT_SIZE);
      page.drawText(text, { x: MARGIN + i * colWidth + 3, y: y - 12, size: FONT_SIZE, font: boldFont });
    });
    y -= HEADER_HEIGHT;
  };

  const newPage = () => {
    page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN;
    drawHeaderRow();
  };

  drawTitle();
  drawHeaderRow();

  for (const row of table.rows) {
    if (y - ROW_HEIGHT < MARGIN) {
      newPage();
    }
    row.forEach((cell, i) => {
      const text = fitText(cell ?? '', colWidth - 6, font, FONT_SIZE);
      page.drawText(text, { x: MARGIN + i * colWidth + 3, y: y - 14, size: FONT_SIZE, font });
    });
    page.drawLine({
      start: { x: MARGIN, y: y - ROW_HEIGHT + 6 },
      end: { x: MARGIN + usableWidth, y: y - ROW_HEIGHT + 6 },
      thickness: 0.5,
      color: rgb(0.85, 0.85, 0.85),
    });
    y -= ROW_HEIGHT;
  }

  if (table.rows.length === 0) {
    page.drawText('Aucune donnée pour cette sélection.', { x: MARGIN, y: y - 14, size: FONT_SIZE, font, color: gray });
  }

  return pdfDoc.save();
};
