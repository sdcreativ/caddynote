import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { prisma } from '../lib/prisma.js';
import { EXPORT_ROLES } from '../lib/authz.js';
import { runDueExports } from '../lib/exportSchedule.js';
import { buildFixture, auth, issueTestToken, type Fixture } from './fixtures.js';

/**
 * §5.15 — Exports planifiés, alignement EXPORT_ROLES, export analytics serveur.
 */
describe('Exports / analytics — recette §5.15', () => {
  let fx: Fixture;
  let headTeacherToken: string;
  const reportIds: string[] = [];

  beforeAll(async () => {
    fx = await buildFixture();
    await prisma.strkProfile.update({
      where: { id: fx.a.teacher.id },
      data: { role: 'head_teacher' },
    });
    headTeacherToken = await issueTestToken({
      sub: fx.a.teacher.id,
      role: 'head_teacher',
      institutionId: fx.a.institutionId,
    });
    await request(app)
      .put(`/institutions/${fx.a.institutionId}/features/advancedReports`)
      .set(auth(fx.globalAdmin.token))
      .send({ enabled: true });
  }, 30000);

  afterAll(async () => {
    await prisma.strkProfile.update({
      where: { id: fx.a.teacher.id },
      data: { role: 'teacher' },
    });
    if (reportIds.length) {
      await prisma.strkReport.deleteMany({ where: { id: { in: reportIds } } });
    }
    await prisma.strkSetting.deleteMany({
      where: { category: 'system', key: 'exportSchedule' },
    });
  });

  it('EXPORT_ROLES serveur inclut head_teacher (aligné front)', () => {
    expect(EXPORT_ROLES).toEqual(expect.arrayContaining(['admin', 'school_admin', 'teacher', 'head_teacher']));
  });

  it('head_teacher peut exporter (P1 droits EXPORT_ROLES)', async () => {
    const res = await request(app)
      .get(`/reports/export?type=students&institutionId=${fx.a.institutionId}`)
      .set(auth(headTeacherToken));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
  });

  it('élève refusé sur export', async () => {
    const res = await request(app)
      .get(`/reports/export?type=students&institutionId=${fx.a.institutionId}`)
      .set(auth(fx.a.student.token));
    expect(res.status).toBe(403);
  });

  it('planifie un export, exécute la file, télécharge le CSV stocké', async () => {
    const scheduledAt = new Date(Date.now() - 1000).toISOString();
    // scheduledAt dans le passé immédiat : la validation refuse < now-60s —
    // on planifie dans 2s puis on force runDueExports après avoir corrigé
    // l’heure en file… Plus simple : planifier dans le futur proche puis
    // appeler runDueExports après avoir avancé scheduledAt via enqueue passé.
    const future = new Date(Date.now() + 120_000).toISOString();
    const created = await request(app)
      .post('/reports/schedule')
      .set(auth(fx.a.schoolAdmin.token))
      .send({
        type: 'students',
        institutionId: fx.a.institutionId,
        scheduledAt: future,
      });
    expect(created.status).toBe(201);
    expect(created.body.job.status).toBe('scheduled');

    // Forcer l’échéance : réécrire la file avec scheduledAt passé.
    const setting = await prisma.strkSetting.findUnique({
      where: { category_key: { category: 'system', key: 'exportSchedule' } },
    });
    const items = (setting?.value as { items: Array<{ id: string; scheduledAt: string }> }).items.map((j) =>
      j.id === created.body.job.id ? { ...j, scheduledAt: new Date(Date.now() - 5_000).toISOString() } : j
    );
    await prisma.strkSetting.update({
      where: { category_key: { category: 'system', key: 'exportSchedule' } },
      data: { value: { items } },
    });

    const run = await request(app)
      .post('/reports/schedule/run')
      .set(auth(fx.a.schoolAdmin.token));
    expect(run.status).toBe(200);
    expect(run.body.processed).toBeGreaterThanOrEqual(1);

    const list = await request(app)
      .get(`/reports/schedule?institutionId=${fx.a.institutionId}`)
      .set(auth(fx.a.schoolAdmin.token));
    expect(list.status).toBe(200);
    const done = list.body.jobs.find((j: { id: string }) => j.id === created.body.job.id);
    expect(done?.status).toBe('done');
    expect(done?.reportId).toBeTruthy();
    reportIds.push(done.reportId);

    const dl = await request(app)
      .get(`/reports/${done.reportId}/download`)
      .set(auth(fx.a.schoolAdmin.token));
    expect(dl.status).toBe(200);
    expect(dl.headers['content-type']).toContain('text/csv');
    expect(dl.text).toContain('Nom');
  });

  it('refuse une planification dans le passé lointain', async () => {
    const res = await request(app)
      .post('/reports/schedule')
      .set(auth(fx.a.schoolAdmin.token))
      .send({
        type: 'students',
        institutionId: fx.a.institutionId,
        scheduledAt: new Date(Date.now() - 3600_000).toISOString(),
      });
    expect(res.status).toBe(400);
  });

  it('P2 — export analytics JSON serveur', async () => {
    const res = await request(app)
      .get(`/analytics/export?format=json&institutionId=${fx.a.institutionId}&days=30`)
      .set(auth(fx.a.schoolAdmin.token));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.headers['content-disposition']).toContain('attachment');
    const body = JSON.parse(res.text);
    expect(body.dashboard).toBeDefined();
    expect(body.academic).toBeDefined();
    expect(body.generatedAt).toBeTruthy();
  });

  it('P2 — export analytics CSV serveur', async () => {
    const res = await request(app)
      .get(`/analytics/export?format=csv&institutionId=${fx.a.institutionId}`)
      .set(auth(fx.globalAdmin.token));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('Métrique');
  });

  it('export analytics refuse un élève', async () => {
    const res = await request(app)
      .get(`/analytics/export?format=json&institutionId=${fx.a.institutionId}`)
      .set(auth(fx.a.student.token));
    expect(res.status).toBe(403);
  });

  it('runDueExports est idempotent si file vide / déjà traitée', async () => {
    const again = await runDueExports();
    expect(again.processed).toBe(0);
  });
});
