import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import request from 'supertest';
import { app } from '../index.js';
import { buildFixture, auth, type Fixture } from './fixtures.js';
import { buildInitiatePaymentBody, buildCheckPaymentBody } from '../lib/cinetpay.js';
import { getIntegrationsStatus } from '../lib/diagnostics.js';
import { runFilePurge } from '../lib/filePurge.js';
import { runDatabaseBackup, verifyBackupFile } from '../lib/backup.js';

/**
 * Dureté production — ce qui est automatisable dans le dépôt
 * (diagnostics, contrat CinetPay, purge dry-run, verify backup).
 * Hors dépôt : pentest tiers, recette pilote, PITR infra.
 */
describe('Dureté production (exploitation)', () => {
  let fx: Fixture;
  const producedFiles: string[] = [];

  beforeAll(async () => {
    fx = await buildFixture();
  }, 30000);

  afterEach(async () => {
    for (const file of producedFiles.splice(0)) {
      await fs.unlink(file).catch(() => {});
    }
  });

  it('POST /finance/webhooks/cinetpay est public (pas 401 sans Bearer)', async () => {
    const res = await request(app).post('/finance/webhooks/cinetpay').send({});
    expect(res.status).toBe(400);
    expect(res.text).toMatch(/transaction_id/i);
  });

  it('getIntegrationsStatus() ne expose aucun secret', () => {
    const status = getIntegrationsStatus();
    expect(status.length).toBeGreaterThan(0);
    const serialized = JSON.stringify(status);
    expect(serialized).not.toMatch(/sk_live|sk_test|AKIA|secret|password|apikey/i);
    for (const row of status) {
      expect(row).toHaveProperty('key');
      expect(row).toHaveProperty('configured');
      expect(typeof row.configured).toBe('boolean');
    }
  });

  it('GET /diagnostics est réservé à l’admin global', async () => {
    const denied = await request(app).get('/diagnostics').set(auth(fx.a.schoolAdmin.token));
    expect(denied.status).toBe(403);

    const ok = await request(app).get('/diagnostics').set(auth(fx.globalAdmin.token));
    expect(ok.status).toBe(200);
    expect(ok.body.database).toBe('connected');
    expect(Array.isArray(ok.body.integrations)).toBe(true);
    expect(ok.body.pilot).toEqual(
      expect.objectContaining({
        ready: expect.any(Boolean),
        blockers: expect.any(Array),
        warnings: expect.any(Array),
      })
    );
    expect(ok.body.integrations.some((i: { key: string }) => i.key === 'file_storage')).toBe(true);
    expect(ok.body.rpoHintHours).toBeTypeOf('number');
    expect(JSON.stringify(ok.body)).not.toMatch(/CINETPAY_API_KEY|STRIPE_SECRET|SMTP_PASS/);
  });

  it('contrat CinetPay Checkout v2 : payload initiate + check', () => {
    process.env.CINETPAY_API_KEY = 'test-key';
    process.env.CINETPAY_SITE_ID = '12345';
    const body = buildInitiatePaymentBody({
      transactionId: 'txn-1',
      amountCents: 150_00,
      currency: 'XOF',
      description: 'Frais',
      customerName: 'Doe',
      customerSurname: 'Jane',
      customerEmail: 'j@example.com',
      customerPhoneNumber: '+22507000000',
      notifyUrl: 'https://api.example/notify',
      returnUrl: 'https://app.example/return',
    });
    expect(body).toMatchObject({
      apikey: 'test-key',
      site_id: '12345',
      transaction_id: 'txn-1',
      amount: 150,
      currency: 'XOF',
      channels: 'ALL',
      customer_name: 'Doe',
      customer_surname: 'Jane',
      customer_email: 'j@example.com',
      customer_phone_number: '+22507000000',
      notify_url: 'https://api.example/notify',
      return_url: 'https://app.example/return',
    });
    expect(buildCheckPaymentBody('txn-1')).toEqual({
      apikey: 'test-key',
      site_id: '12345',
      transaction_id: 'txn-1',
    });
  });

  it('runFilePurge() reste en dry-run sans FILE_PURGE_ENABLED', async () => {
    const prev = process.env.FILE_PURGE_ENABLED;
    delete process.env.FILE_PURGE_ENABLED;
    try {
      const result = await runFilePurge({ dryRun: false });
      expect(result.dryRun).toBe(true);
      expect(result.deleted).toEqual([]);
    } finally {
      if (prev === undefined) delete process.env.FILE_PURGE_ENABLED;
      else process.env.FILE_PURGE_ENABLED = prev;
    }
  });

  it('POST /files/purge (admin) répond en dry-run', async () => {
    const denied = await request(app).post('/files/purge').set(auth(fx.a.schoolAdmin.token)).send({});
    expect(denied.status).toBe(403);

    const res = await request(app)
      .post('/files/purge')
      .set(auth(fx.globalAdmin.token))
      .send({ dryRun: true });
    expect(res.status).toBe(200);
    expect(res.body.dryRun).toBe(true);
    expect(Array.isArray(res.body.candidates)).toBe(true);
  });

  it('verifyBackupFile() lit le TOC d’un dump réel', async () => {
    const backup = await runDatabaseBackup();
    if (backup.localPath) producedFiles.push(backup.localPath);
    expect(backup.localPath).toBeTruthy();
    const verified = await verifyBackupFile(backup.localPath!);
    expect(verified.ok).toBe(true);
    expect(verified.tocEntries).toBeGreaterThan(0);
  }, 30000);

  it('POST /backups/verify accepte un localPath (sans S3)', async () => {
    const backup = await runDatabaseBackup();
    if (backup.localPath) producedFiles.push(backup.localPath);
    const res = await request(app)
      .post('/backups/verify')
      .set(auth(fx.globalAdmin.token))
      .send({ localPath: backup.localPath });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  }, 30000);
});
