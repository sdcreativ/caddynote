import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  wrapTransactionalEmail,
  roleLabelFr,
  brandLogoUrl,
  escapeHtml,
} from '../lib/emailLayout.js';

describe('emailLayout — gabarit transactionnel', () => {
  const prevApp = process.env.APP_URL;

  beforeEach(() => {
    process.env.APP_URL = 'https://staging.example.test';
  });

  afterEach(() => {
    process.env.APP_URL = prevApp;
  });

  it('inclut logo CaddyNote, titre et CTA', () => {
    const html = wrapTransactionalEmail({
      preheader: 'Préheader test',
      title: 'Votre dossier est créé',
      bodyHtml: '<p>Bonjour</p>',
      cta: { label: 'Ouvrir mon suivi', url: 'https://staging.example.test/admissions/suivi/abc' },
      footerNote: 'Note de sécurité',
    });
    expect(html).toContain(brandLogoUrl());
    expect(html).toContain('logo-cn-light.png');
    expect(html).toContain('Votre dossier est créé');
    expect(html).toContain('Ouvrir mon suivi');
    expect(html).toContain('https://staging.example.test/admissions/suivi/abc');
    expect(html).toContain('CaddyNote');
    expect(html).toContain('Note de sécurité');
  });

  it('échappe le HTML dangereux dans le titre / CTA', () => {
    const html = wrapTransactionalEmail({
      preheader: 'x',
      title: '<script>alert(1)</script>',
      bodyHtml: '<p>ok</p>',
      cta: { label: 'A < B', url: 'https://example.test/?a=1&b=2' },
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain(escapeHtml('<script>alert(1)</script>'));
    expect(html).toContain('A &lt; B');
  });

  it('traduit les rôles en français', () => {
    expect(roleLabelFr('school_admin')).toContain('administrateur');
    expect(roleLabelFr('teacher')).toBe('enseignant');
    expect(roleLabelFr('parent')).toContain('parent');
  });
});
