import { PDFDocument, StandardFonts, rgb, degrees, type RGB, type PDFFont } from 'pdf-lib';
import QRCode from 'qrcode';

/**
 * Rendu PDF générique pour les documents officiels (DOC-001) : en-tête
 * établissement (personnalisable, DOC-002), titre, corps en paragraphes, QR
 * de vérification publique en pied de page (DOC-004). `pdf-lib` est pur JS
 * (pas de Chromium headless) — adapté à un environnement serveur sans
 * dépendance système supplémentaire.
 *
 * DOC-002 (modèles par établissement) : logo, couleur d'accent, police,
 * filigrane, bloc de signature et mention de pied de page personnalisables
 * (`StrkDocumentTemplate`, voir `documents.routes.ts`). Le bloc de
 * vérification (QR, jeton, établissement, version, date) reste en revanche
 * TOUJOURS généré par le système à un emplacement fixe — "zone protégée"
 * qu'aucune personnalisation d'établissement ne peut altérer, recouvrir ou
 * masquer, pour préserver l'authenticité vérifiable du document (DOC-004)
 * indépendamment de son apparence. Limite assumée : mise en page fixe à une
 * page, configurable par champs — pas un éditeur visuel à positionnement
 * libre (hors périmètre : projet à part entière).
 */

const PAGE_WIDTH = 595.28; // A4 portrait, en points
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;
const DEFAULT_ACCENT: RGB = rgb(0.1, 0.1, 0.1);
// Bas de page réservé à la zone protégée (QR + mentions de vérification) :
// rien d'autre ne doit être dessiné en dessous de cette limite.
const PROTECTED_ZONE_TOP = 150;

export type DocumentFontFamily = 'helvetica' | 'times' | 'courier';

const FONT_MAP: Record<DocumentFontFamily, { regular: StandardFonts; bold: StandardFonts }> = {
  helvetica: { regular: StandardFonts.Helvetica, bold: StandardFonts.HelveticaBold },
  times: { regular: StandardFonts.TimesRoman, bold: StandardFonts.TimesRomanBold },
  courier: { regular: StandardFonts.Courier, bold: StandardFonts.CourierBold },
};

/** Découpe naïvement un paragraphe en lignes d'une largeur maximale
 * approximative (en nombre de caractères) — suffisant pour du texte
 * français courant en Helvetica 12pt sur une page A4. */
const wrapText = (text: string, maxCharsPerLine: number): string[] => {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxCharsPerLine && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
};

/** "#RRGGBB" -> RGB pdf-lib (composantes 0-1). Retombe sur la couleur par
 * défaut si le format est invalide, jamais d'erreur bloquante pour une
 * simple préférence d'affichage. */
const parseHexColor = (hex: string | null | undefined): RGB => {
  const match = /^#?([0-9a-fA-F]{6})$/.exec(hex ?? '');
  if (!match) return DEFAULT_ACCENT;
  const value = parseInt(match[1], 16);
  return rgb(((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255);
};

/** Détecte PNG/JPEG par en-tête binaire et embarque avec la bonne méthode
 * pdf-lib — un logo d'établissement peut avoir été fourni dans l'un ou
 * l'autre format. */
const embedLogo = async (pdfDoc: PDFDocument, bytes: Uint8Array) => {
  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  return isPng ? pdfDoc.embedPng(bytes) : pdfDoc.embedJpg(bytes);
};

export interface DocumentBranding {
  logoBytes?: Uint8Array | null;
  accentColor?: string | null;
  footerText?: string | null;
  showAddress?: boolean;
  font?: DocumentFontFamily;
  watermarkEnabled?: boolean;
  signatureLabel?: string | null;
  signatureName?: string | null;
}

export interface RenderDocumentParams {
  title: string;
  institutionName: string;
  institutionAddress?: string | null;
  /** Corps du document, un élément = un paragraphe (sauts de ligne automatiques). */
  paragraphs: string[];
  verificationUrl: string;
  documentId: string;
  version: number;
  generatedAt: Date;
  branding?: DocumentBranding;
}

/** Filigrane discret : nom de l'établissement en diagonale, très clair,
 * dessiné en premier (donc visuellement "derrière" tout le reste). Jamais
 * dans la zone protégée — la diagonale traverse la page mais le texte de
 * vérification est redessiné par-dessus ensuite, jamais recouvert. */
const drawWatermark = (page: ReturnType<PDFDocument['addPage']>, font: PDFFont, text: string) => {
  const size = 60;
  const textWidth = font.widthOfTextAtSize(text, size);
  page.drawText(text, {
    x: PAGE_WIDTH / 2 - textWidth / 2,
    y: PAGE_HEIGHT / 2,
    size,
    font,
    color: rgb(0.93, 0.93, 0.93),
    rotate: degrees(35),
  });
};

export const renderPdfDocument = async (params: RenderDocumentParams): Promise<Uint8Array> => {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const fontFamily = FONT_MAP[params.branding?.font ?? 'helvetica'];
  const font = await pdfDoc.embedFont(fontFamily.regular);
  const boldFont = await pdfDoc.embedFont(fontFamily.bold);
  const gray = rgb(0.4, 0.4, 0.4);
  const accent = parseHexColor(params.branding?.accentColor);
  const showAddress = params.branding?.showAddress ?? true;

  if (params.branding?.watermarkEnabled) {
    drawWatermark(page, boldFont, params.institutionName);
  }

  let y = PAGE_HEIGHT - 60;
  let headerTextX = MARGIN;

  if (params.branding?.logoBytes) {
    try {
      const logoImage = await embedLogo(pdfDoc, params.branding.logoBytes);
      const logoHeight = 48;
      const logoWidth = (logoImage.width / logoImage.height) * logoHeight;
      page.drawImage(logoImage, { x: MARGIN, y: y - logoHeight + 12, width: logoWidth, height: logoHeight });
      headerTextX = MARGIN + logoWidth + 15;
    } catch (error) {
      // Un logo corrompu/format non supporté ne doit jamais empêcher la
      // génération du document — dégradation silencieuse vers l'en-tête texte.
      console.error('Logo établissement non intégré (format illisible) :', error);
    }
  }

  page.drawText(params.institutionName, { x: headerTextX, y, size: 16, font: boldFont, color: accent });
  y -= 20;
  if (showAddress && params.institutionAddress) {
    page.drawText(params.institutionAddress, { x: headerTextX, y, size: 10, font, color: gray });
    y -= 20;
  }
  y -= 15;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 1, color: rgb(0.85, 0.85, 0.85) });
  y -= 40;

  page.drawText(params.title, { x: MARGIN, y, size: 20, font: boldFont, color: accent });
  y -= 40;

  for (const paragraph of params.paragraphs) {
    for (const line of wrapText(paragraph, 90)) {
      if (y < PROTECTED_ZONE_TOP) break; // page unique : contenu excédentaire tronqué plutôt que de chevaucher la zone protégée
      page.drawText(line, { x: MARGIN, y, size: 12, font });
      y -= 18;
    }
    y -= 10;
  }

  if (params.branding?.footerText && y >= PROTECTED_ZONE_TOP) {
    for (const line of wrapText(params.branding.footerText, 100)) {
      if (y < PROTECTED_ZONE_TOP) break;
      page.drawText(line, { x: MARGIN, y, size: 9, font, color: gray });
      y -= 14;
    }
  }

  // Bloc de signature (facultatif) — dessiné seulement s'il reste assez de
  // place au-dessus de la zone protégée, jamais en chevauchement avec elle.
  const signatureLabel = params.branding?.signatureLabel;
  const signatureName = params.branding?.signatureName;
  if ((signatureLabel || signatureName) && y - 70 >= PROTECTED_ZONE_TOP) {
    y -= 20;
    page.drawText(`Fait le ${params.generatedAt.toLocaleDateString('fr-FR')}`, { x: MARGIN, y, size: 10, font, color: gray });
    y -= 40;
    page.drawLine({ start: { x: MARGIN, y: y + 12 }, end: { x: MARGIN + 160, y: y + 12 }, thickness: 0.5, color: gray });
    if (signatureLabel) {
      page.drawText(signatureLabel, { x: MARGIN, y, size: 10, font, color: gray });
      y -= 14;
    }
    if (signatureName) {
      page.drawText(signatureName, { x: MARGIN, y, size: 11, font: boldFont });
      y -= 14;
    }
  }

  // --- Zone protégée (DOC-004) : jamais affectée par la personnalisation
  // d'établissement ci-dessus, ni en position ni en contenu. ---
  const qrPngBytes = await QRCode.toBuffer(params.verificationUrl, { margin: 1, width: 120 });
  const qrImage = await pdfDoc.embedPng(qrPngBytes);
  const qrSize = 90;
  const footerY = 50;
  page.drawImage(qrImage, { x: PAGE_WIDTH - MARGIN - qrSize, y: footerY, width: qrSize, height: qrSize });
  page.drawText('Vérifier ce document :', { x: MARGIN, y: footerY + qrSize - 12, size: 8, font, color: gray });
  page.drawText(params.verificationUrl, { x: MARGIN, y: footerY + qrSize - 24, size: 8, font, color: gray });
  page.drawText(
    `Document ${params.documentId} · version ${params.version} · généré le ${params.generatedAt.toLocaleDateString('fr-FR')}`,
    { x: MARGIN, y: footerY + qrSize - 36, size: 8, font, color: gray }
  );

  return pdfDoc.save();
};

/** Carte élève format portefeuille CR80 (~85,6 × 54 mm ≈ 243 × 153 pt),
 * distincte des documents A4 (certificat, attestation, facture…). */
export interface RenderStudentCardParams {
  institutionName: string;
  studentName: string;
  studentNumber?: string | null;
  className?: string | null;
  academicYear: string;
  dateOfBirth?: string | null;
  verificationUrl: string;
  documentId: string;
  version: number;
  generatedAt: Date;
  accentColor?: string | null;
  photoBytes?: Uint8Array | null;
}

const CARD_WIDTH = 243;
const CARD_HEIGHT = 153;

export const renderStudentCardPdf = async (params: RenderStudentCardParams): Promise<Uint8Array> => {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([CARD_WIDTH, CARD_HEIGHT]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const accent = parseHexColor(params.accentColor);
  const gray = rgb(0.35, 0.35, 0.35);
  const white = rgb(1, 1, 1);

  page.drawRectangle({ x: 0, y: 0, width: CARD_WIDTH, height: CARD_HEIGHT, color: white });
  page.drawRectangle({ x: 0, y: CARD_HEIGHT - 28, width: CARD_WIDTH, height: 28, color: accent });
  page.drawText(params.institutionName.slice(0, 36), {
    x: 8,
    y: CARD_HEIGHT - 18,
    size: 9,
    font: boldFont,
    color: white,
  });

  let textX = 8;
  if (params.photoBytes) {
    try {
      const photo = await embedLogo(pdfDoc, params.photoBytes);
      const h = 64;
      const w = Math.min((photo.width / photo.height) * h, 52);
      page.drawImage(photo, { x: 8, y: CARD_HEIGHT - 100, width: w, height: h });
      textX = 8 + w + 8;
    } catch {
      // photo illisible : carte texte seule
    }
  }

  page.drawText('CARTE ÉLÈVE', { x: textX, y: CARD_HEIGHT - 42, size: 8, font: boldFont, color: accent });
  page.drawText(params.studentName.slice(0, 28), { x: textX, y: CARD_HEIGHT - 56, size: 10, font: boldFont });
  const lines = [
    params.studentNumber ? `Matricule : ${params.studentNumber}` : null,
    params.className ? `Classe : ${params.className}` : null,
    `Année : ${params.academicYear}`,
    params.dateOfBirth ? `Né(e) : ${params.dateOfBirth}` : null,
  ].filter(Boolean) as string[];
  let y = CARD_HEIGHT - 70;
  for (const line of lines) {
    page.drawText(line.slice(0, 34), { x: textX, y, size: 7, font, color: gray });
    y -= 11;
  }

  const qrPngBytes = await QRCode.toBuffer(params.verificationUrl, { margin: 0, width: 80 });
  const qrImage = await pdfDoc.embedPng(qrPngBytes);
  const qrSize = 36;
  page.drawImage(qrImage, { x: CARD_WIDTH - qrSize - 6, y: 6, width: qrSize, height: qrSize });
  page.drawText(`v${params.version} · ${params.generatedAt.toLocaleDateString('fr-FR')}`, {
    x: 8,
    y: 10,
    size: 6,
    font,
    color: gray,
  });

  return pdfDoc.save();
};
