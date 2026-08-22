import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { prisma } from '../lib/prisma.js';
import { buildFixture, auth, type Fixture } from './fixtures.js';

/**
 * Chap. 22.1 — import CSV enseignants et classes (reprise de données).
 */
describe('Import CSV enseignants et classes (22.1)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await buildFixture();
  }, 30000);

  const rnd = () => Math.random().toString(36).slice(2, 10);

  describe('enseignants', () => {
    it('crée les enseignants, extension StrkTeacher, journalise le lot', async () => {
      const e1 = `teach.${rnd()}@test.caddynote`;
      const e2 = `head.${rnd()}@test.caddynote`;
      const csv = `firstName,lastName,email,role\nAlice,Prof,${e1},teacher\nBob,Chef,${e2},head_teacher\n`;

      const res = await request(app)
        .post('/users/import')
        .set(auth(fx.a.schoolAdmin.token))
        .send({ csv, institutionId: fx.a.institutionId });
      expect(res.status).toBe(200);
      expect(res.body.created).toBe(2);
      expect(res.body.errors).toBe(0);

      const alice = await prisma.strkProfile.findUnique({ where: { email: e1 } });
      expect(alice?.role).toBe('teacher');
      expect(await prisma.strkTeacher.findUnique({ where: { id: alice!.id } })).not.toBeNull();

      const bob = await prisma.strkProfile.findUnique({ where: { email: e2 } });
      expect(bob?.role).toBe('head_teacher');
      expect(await prisma.strkTeacher.findUnique({ where: { id: bob!.id } })).not.toBeNull();

      const audit = await prisma.strkAuditLog.findFirst({
        where: { action: 'teacher.bulk_imported', institutionId: fx.a.institutionId },
        orderBy: { createdAt: 'desc' },
      });
      expect(audit).not.toBeNull();
      expect((audit!.metadata as { created: number }).created).toBe(2);
    });

    it('signale une ligne invalide sans bloquer le reste', async () => {
      const valid = `teach.${rnd()}@test.caddynote`;
      const csv = `firstName,lastName,email\n,SansPrenom,${`x.${rnd()}@test.caddynote`}\nClaire,Valid,${valid}\n`;
      const res = await request(app)
        .post('/users/import')
        .set(auth(fx.a.schoolAdmin.token))
        .send({ csv, institutionId: fx.a.institutionId });
      expect(res.status).toBe(200);
      expect(res.body.created).toBe(1);
      expect(res.body.errors).toBe(1);
    });

    it('refuse un rôle hors enseignant', async () => {
      const csv = `firstName,lastName,email,role\nEve,Admin,${`adm.${rnd()}@test.caddynote`},admin\n`;
      const res = await request(app)
        .post('/users/import')
        .set(auth(fx.a.schoolAdmin.token))
        .send({ csv, institutionId: fx.a.institutionId });
      expect(res.status).toBe(200);
      expect(res.body.created).toBe(0);
      expect(res.body.errors).toBe(1);
    });

    it('isole le tenant et refuse l’enseignant (ORG-004)', async () => {
      const csv = `firstName,lastName,email\nX,Y,${`z.${rnd()}@test.caddynote`}\n`;
      const asB = await request(app)
        .post('/users/import')
        .set(auth(fx.b.schoolAdmin.token))
        .send({ csv, institutionId: fx.a.institutionId });
      expect(asB.status).toBe(403);

      const asTeacher = await request(app)
        .post('/users/import')
        .set(auth(fx.a.teacher.token))
        .send({ csv, institutionId: fx.a.institutionId });
      expect(asTeacher.status).toBe(403);
    });
  });

  describe('classes', () => {
    it('crée des classes et rattache un enseignant par e-mail', async () => {
      const className = `6e-${rnd()}`;
      const csv = `name,academicYear,teacherEmail\n${className},2025-2026,${fx.a.teacher.email}\n`;
      const res = await request(app)
        .post('/classes/import')
        .set(auth(fx.a.schoolAdmin.token))
        .send({ csv, institutionId: fx.a.institutionId });
      expect(res.status).toBe(200);
      expect(res.body.created).toBe(1);

      const klass = await prisma.strkClass.findFirst({
        where: { institutionId: fx.a.institutionId, name: className },
      });
      expect(klass?.teacherId).toBe(fx.a.teacher.id);
      expect(klass?.academicYear).toBe('2025-2026');

      const audit = await prisma.strkAuditLog.findFirst({
        where: { action: 'class.bulk_imported', institutionId: fx.a.institutionId },
        orderBy: { createdAt: 'desc' },
      });
      expect(audit).not.toBeNull();
    });

    it('ignore un nom déjà présent et signale un enseignant inconnu', async () => {
      const existing = await prisma.strkClass.findUnique({ where: { id: fx.a.classId } });
      const csv = `name,teacherEmail\n${existing!.name},\nNouvelle-${rnd()},inconnu.${rnd()}@test.caddynote\n`;
      const res = await request(app)
        .post('/classes/import')
        .set(auth(fx.a.schoolAdmin.token))
        .send({ csv, institutionId: fx.a.institutionId });
      expect(res.status).toBe(200);
      expect(res.body.skipped).toBe(1);
      expect(res.body.errors).toBe(1);
      expect(res.body.created).toBe(0);
    });

    it('refuse l’établissement B', async () => {
      const res = await request(app)
        .post('/classes/import')
        .set(auth(fx.b.schoolAdmin.token))
        .send({ csv: 'name\nIntrus\n', institutionId: fx.a.institutionId });
      expect(res.status).toBe(403);
    });
  });
});
