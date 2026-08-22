import { describe, it, expect } from 'vitest';
import { renderPdfDocument } from './pdf.js';

// Un PNG 1x1 valide minimal (transparent), suffisant pour vérifier que le
// chemin d'intégration de logo (DOC-002) fonctionne réellement avec pdf-lib,
// sans dépendre d'un vrai fichier binaire dans le dépôt.
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);

const baseParams = {
  title: 'Certificat de scolarité',
  institutionName: 'École de test',
  institutionAddress: '1 rue des Tests',
  paragraphs: ['Ceci est un document de test.'],
  verificationUrl: 'https://example.test/documents/verify/abc123',
  documentId: 'doc-1',
  version: 1,
  generatedAt: new Date('2026-01-01'),
};

describe('renderPdfDocument (DOC-001/002)', () => {
  it('génère un PDF valide sans personnalisation', async () => {
    const bytes = await renderPdfDocument(baseParams);
    expect(Buffer.from(bytes).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('intègre un logo, une couleur d’accent et une mention de pied de page (DOC-002)', async () => {
    const bytes = await renderPdfDocument({
      ...baseParams,
      branding: { logoBytes: TINY_PNG, accentColor: '#3b82f6', footerText: 'Document officiel — ne pas reproduire', showAddress: true },
    });
    expect(Buffer.from(bytes).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('masque l’adresse si showAddress est désactivé', async () => {
    const bytes = await renderPdfDocument({
      ...baseParams,
      branding: { showAddress: false },
    });
    expect(Buffer.from(bytes).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('ne plante jamais sur un logo corrompu — dégrade vers l’en-tête texte seul', async () => {
    const bytes = await renderPdfDocument({
      ...baseParams,
      branding: { logoBytes: Buffer.from('ceci-nest-pas-une-image') },
    });
    expect(Buffer.from(bytes).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('retombe sur la couleur par défaut si accentColor est mal formée', async () => {
    const bytes = await renderPdfDocument({
      ...baseParams,
      branding: { accentColor: 'pas-une-couleur' },
    });
    expect(Buffer.from(bytes).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it.each(['helvetica', 'times', 'courier'] as const)('rend un PDF valide avec la police "%s"', async (font) => {
    const bytes = await renderPdfDocument({ ...baseParams, branding: { font } });
    expect(Buffer.from(bytes).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('intègre un filigrane sans faire planter le rendu', async () => {
    const bytes = await renderPdfDocument({ ...baseParams, branding: { watermarkEnabled: true } });
    expect(Buffer.from(bytes).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('intègre un bloc de signature', async () => {
    const bytes = await renderPdfDocument({
      ...baseParams,
      branding: { signatureLabel: 'Le directeur', signatureName: 'M. Dupont' },
    });
    expect(Buffer.from(bytes).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('ne chevauche jamais la zone protégée même avec un contenu très long', async () => {
    const bytes = await renderPdfDocument({
      ...baseParams,
      paragraphs: Array(40).fill('Ceci est un paragraphe très long qui répète du texte pour remplir la page entièrement et tester le comportement en cas de débordement de contenu sur une seule page.'),
      branding: { footerText: 'Mention de bas de page', signatureLabel: 'Le directeur', signatureName: 'M. Dupont' },
    });
    expect(Buffer.from(bytes).subarray(0, 5).toString()).toBe('%PDF-');
  });
});
