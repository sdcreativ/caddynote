import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { prisma } from '../lib/prisma.js';
import { buildFixture, auth, type Fixture } from './fixtures.js';

/** IAM-005 — couverture étendue (devoirs, classes, observations). */
describe('Journal d’audit étendu (IAM-005)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await buildFixture();
  }, 30000);

  it('trace la création d’un devoir', async () => {
    const due = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const create = await request(app)
      .post('/assignments')
      .set(auth(fx.a.teacher.token))
      .send({
        courseId: fx.a.courseId,
        teacherId: fx.a.teacher.id,
        title: `Audit devoir ${Date.now()}`,
        dueDate: due,
      });
    expect(create.status).toBe(201);

    const entry = await prisma.strkAuditLog.findFirst({
      where: { action: 'assignment.created', targetId: create.body.assignment.id },
    });
    expect(entry).not.toBeNull();
    expect(entry!.actorId).toBe(fx.a.teacher.id);
  });

  it('trace la création et la désactivation d’une classe', async () => {
    const name = `Classe-audit-${Date.now()}`;
    const create = await request(app)
      .post('/classes')
      .set(auth(fx.a.schoolAdmin.token))
      .send({ name, institutionId: fx.a.institutionId });
    expect(create.status).toBe(201);

    const created = await prisma.strkAuditLog.findFirst({
      where: { action: 'class.created', targetId: create.body.class.id },
    });
    expect(created).not.toBeNull();

    const del = await request(app)
      .delete(`/classes/${create.body.class.id}`)
      .set(auth(fx.a.schoolAdmin.token));
    expect(del.status).toBe(200);

    const deactivated = await prisma.strkAuditLog.findFirst({
      where: { action: 'class.deactivated', targetId: create.body.class.id },
    });
    expect(deactivated).not.toBeNull();
  });

  it('expose le journal à la direction, pas à l’enseignant', async () => {
    const asAdmin = await request(app)
      .get(`/audit-log?institutionId=${fx.a.institutionId}&limit=5`)
      .set(auth(fx.a.schoolAdmin.token));
    expect(asAdmin.status).toBe(200);
    expect(Array.isArray(asAdmin.body.logs)).toBe(true);

    const asTeacher = await request(app)
      .get(`/audit-log?institutionId=${fx.a.institutionId}`)
      .set(auth(fx.a.teacher.token));
    expect(asTeacher.status).toBe(403);
  });
});
