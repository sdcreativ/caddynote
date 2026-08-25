import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { prisma } from '../lib/prisma.js';
import { planFilePurge, runFilePurge } from '../lib/filePurge.js';
import { buildFixture, auth, type Fixture } from './fixtures.js';

/**
 * §5.9 P2 — rétention fichiers (DOC-005) : planification admissions + garde dry-run ops.
 */
describe('Documents — purge rétention fichiers (§5.9 / DOC-005)', () => {
  let fx: Fixture;
  let appId: string;
  const fileKey = `inscription/inst-test/purge-§5.9-${Date.now()}.pdf`;

  beforeAll(async () => {
    fx = await buildFixture();
    const stale = await prisma.strkAdmissionApplication.create({
      data: {
        institutionId: fx.a.institutionId,
        academicYear: '2024-2025',
        status: 'rejected',
        studentFirstName: 'Purge',
        studentLastName: 'Doc59',
        studentBirthDate: new Date('2014-05-01'),
        contactEmail: `purge.59.${Date.now()}@example.test`,
        guardians: [],
        documents: [{ label: 'Pièce', fileKey }],
        publicToken: `purge-59-${Date.now()}`,
        updatedAt: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000),
      },
    });
    appId = stale.id;
    // Prisma @updatedAt peut réécrire updatedAt — forcer via SQL raw si besoin.
    await prisma.$executeRaw`
      UPDATE strk_admission_applications
      SET updated_at = NOW() - INTERVAL '400 days'
      WHERE id = ${appId}::uuid
    `;
  }, 30000);

  afterAll(async () => {
    if (appId) {
      await prisma.strkAdmissionApplication.delete({ where: { id: appId } }).catch(() => {});
    }
  });

  it('planFilePurge inclut les pièces d’admissions rejected/cancelled > 365 j', async () => {
    const candidates = await planFilePurge();
    expect(candidates.some((c) => c.key === fileKey)).toBe(true);
  });

  it('runFilePurge reste dry-run sans FILE_PURGE_ENABLED (aucune suppression)', async () => {
    const prev = process.env.FILE_PURGE_ENABLED;
    delete process.env.FILE_PURGE_ENABLED;
    try {
      const result = await runFilePurge({ dryRun: false });
      expect(result.dryRun).toBe(true);
      expect(result.deleted).toEqual([]);
      expect(result.candidates.some((c) => c.key === fileKey)).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.FILE_PURGE_ENABLED;
      else process.env.FILE_PURGE_ENABLED = prev;
    }
  });

  it('POST /files/purge réservé admin global — dry-run ops', async () => {
    const denied = await request(app).post('/files/purge').set(auth(fx.a.schoolAdmin.token)).send({});
    expect(denied.status).toBe(403);

    const res = await request(app)
      .post('/files/purge')
      .set(auth(fx.globalAdmin.token))
      .send({ dryRun: true });
    expect(res.status).toBe(200);
    expect(res.body.dryRun).toBe(true);
    expect(Array.isArray(res.body.candidates)).toBe(true);
    expect(res.body.candidates.some((c: { key: string }) => c.key === fileKey)).toBe(true);
  });
});
