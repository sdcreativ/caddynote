import { describe, it, expect } from 'vitest';
import {
  buildIntegrationAlerts,
  findIntegration,
  integrationLabel,
  normalizeIntegrations,
} from './integrationDiagnostics';

describe('integrationDiagnostics', () => {
  const apiArray = [
    { key: 'test_mode', configured: false, notes: 'Désactivé' },
    { key: 'file_storage', configured: true, notes: 'Mode S3' },
    { key: 's3', configured: false, notes: 'Bucket S3 absent' },
    { key: 'smtp', configured: true },
    { key: 'stripe', configured: false },
    { key: 'file_purge', configured: false },
  ];

  it('normalise le tableau API avec les clés métier', () => {
    const items = normalizeIntegrations(apiArray);
    expect(items.map((i) => i.key)).toEqual([
      'test_mode',
      'file_storage',
      's3',
      'smtp',
      'stripe',
      'file_purge',
    ]);
  });

  it('affiche des libellés professionnels', () => {
    expect(integrationLabel('s3')).toBe('Stockage S3');
    expect(integrationLabel('smtp')).toBe('E-mail (SMTP)');
    expect(integrationLabel('cinetpay')).toBe('CinetPay (Mobile Money)');
  });

  it('n’alerte pas le mode test quand il est désactivé', () => {
    const alerts = buildIntegrationAlerts(apiArray);
    expect(alerts.find((a) => a.key === 'test_mode')).toBeUndefined();
  });

  it('alerte le mode test uniquement quand il est actif', () => {
    const alerts = buildIntegrationAlerts([
      { key: 'test_mode', configured: true, notes: 'Mode test' },
    ]);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].label).toBe('Mode test plateforme');
    expect(alerts[0].severity).toBe('critical');
  });

  it('alerte les intégrations manquantes puis disparaît quand configurées', () => {
    const before = buildIntegrationAlerts(apiArray);
    expect(before.map((a) => a.label)).toEqual([
      'Stockage S3',
      'Stripe (paiements carte)',
    ]);
    expect(before.find((a) => a.key === 'file_purge')).toBeUndefined();

    const after = buildIntegrationAlerts(
      apiArray.map((i) => (i.key === 's3' || i.key === 'stripe' ? { ...i, configured: true } : i))
    );
    expect(after).toHaveLength(0);
  });

  it('tolère un Record indexé (régression Object.entries sur tableau)', () => {
    const asRecord = Object.fromEntries(apiArray.map((i, idx) => [String(idx), i]));
    const alerts = buildIntegrationAlerts(asRecord);
    expect(alerts.every((a) => !/^\d+$/.test(a.label))).toBe(true);
    expect(alerts.map((a) => a.key)).toEqual(['s3', 'stripe']);
  });

  it('findIntegration retrouve stripe dans un tableau', () => {
    expect(findIntegration(apiArray, 'stripe')?.configured).toBe(false);
    expect(findIntegration(apiArray, 'smtp')?.configured).toBe(true);
  });
});
