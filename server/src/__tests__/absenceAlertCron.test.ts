import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { prisma } from '../lib/prisma.js';
import { runAbsenceAlertCheck } from '../lib/absenceAlertCron.js';
import { buildFixture, auth, type Fixture } from './fixtures.js';

// PRS-004 — alerte parentale. SMS/e-mail ne sont pas configurés ici, donc le
// canal effectif est "push" (repli) : notification interne + journal.
describe('Alerte parentale automatique (PRS-004)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await buildFixture();
  }, 30000);

  /** Absence ancienne créée hors flux HTTP (pas d’alerte immédiate) — pour le cron. */
  const seedOldUnjustifiedAbsence = async () => {
    const absence = await prisma.strkAbsence.create({
      data: {
        studentId: fx.a.student.id,
        institutionId: fx.a.institutionId,
        type: 'absence',
        date: new Date('2000-01-01'),
        duration: 60,
        justified: false,
        createdBy: fx.a.teacher.id,
      },
    });
    return absence.id;
  };

  describe('notification immédiate à la saisie d’appel', () => {
    it('alerte le responsable dès POST /absences (type absence)', async () => {
      const notifBefore = await prisma.notification.count({ where: { userId: fx.parentA.id } });

      const res = await request(app).post('/absences').set(auth(fx.a.teacher.token)).send({
        studentId: fx.a.student.id,
        institutionId: fx.a.institutionId,
        type: 'absence',
        date: new Date().toISOString().split('T')[0],
        duration: 60,
      });
      expect(res.status).toBe(201);

      const absence = await prisma.strkAbsence.findUnique({ where: { id: res.body.absence.id } });
      expect(absence?.alertSentAt).not.toBeNull();

      const notifAfter = await prisma.notification.count({ where: { userId: fx.parentA.id } });
      expect(notifAfter).toBe(notifBefore + 1);

      const log = await prisma.strkCommunicationLog.findFirst({
        where: { recipientId: fx.parentA.id, isCritical: true },
        orderBy: { requestedAt: 'desc' },
      });
      expect(log).not.toBeNull();
      expect(log?.status).toBe('delivered');
      expect(log?.channel).toBe('push');
    });

    it('mentionne le nom de l’élève, le cours et l’horaire', async () => {
      await prisma.strkCourse.update({
        where: { id: fx.a.courseId },
        data: { name: 'Mathématiques 5e', scheduleTime: '09:30', duration: 55 },
      });
      await prisma.strkProfile.update({
        where: { id: fx.a.student.id },
        data: { firstName: 'Camille', lastName: 'Dupont' },
      });

      const res = await request(app).post('/absences').set(auth(fx.a.teacher.token)).send({
        studentId: fx.a.student.id,
        institutionId: fx.a.institutionId,
        courseId: fx.a.courseId,
        type: 'absence',
        date: '2026-03-10',
        duration: 55,
      });
      expect(res.status).toBe(201);

      const log = await prisma.strkCommunicationLog.findFirst({
        where: { recipientId: fx.parentA.id, isCritical: true },
        orderBy: { requestedAt: 'desc' },
      });
      expect(log?.subject).toBe('Absence de Camille Dupont');
      expect(log?.body).toContain('Camille Dupont');
      expect(log?.body).toContain('Mathématiques 5e');
      expect(log?.body).toMatch(/09:30/);

      const notif = await prisma.notification.findFirst({
        where: { userId: fx.parentA.id },
        orderBy: { createdAt: 'desc' },
      });
      expect(notif?.title).toBe('Absence de Camille Dupont');
      expect(notif?.message).toContain('Mathématiques 5e');
      expect(notif?.message).toMatch(/09:30/);
    });

    it('alerte le responsable pour un retard, avec nom / cours / horaire', async () => {
      await prisma.strkCourse.update({
        where: { id: fx.a.courseId },
        data: { name: 'Anglais 5e', scheduleTime: '14:00', duration: 50 },
      });
      await prisma.strkProfile.update({
        where: { id: fx.a.student.id },
        data: { firstName: 'Noah', lastName: 'Bernard' },
      });

      const notifBefore = await prisma.notification.count({ where: { userId: fx.parentA.id } });
      const res = await request(app).post('/absences').set(auth(fx.a.teacher.token)).send({
        studentId: fx.a.student.id,
        institutionId: fx.a.institutionId,
        courseId: fx.a.courseId,
        type: 'lateness',
        date: '2026-03-11',
        duration: 15,
      });
      expect(res.status).toBe(201);
      const absence = await prisma.strkAbsence.findUnique({ where: { id: res.body.absence.id } });
      expect(absence?.alertSentAt).not.toBeNull();

      const notifAfter = await prisma.notification.count({ where: { userId: fx.parentA.id } });
      expect(notifAfter).toBe(notifBefore + 1);

      const log = await prisma.strkCommunicationLog.findFirst({
        where: { recipientId: fx.parentA.id, isCritical: true },
        orderBy: { requestedAt: 'desc' },
      });
      expect(log?.subject).toBe('Retard de Noah Bernard');
      expect(log?.body).toContain('Noah Bernard');
      expect(log?.body).toContain('Anglais 5e');
      expect(log?.body).toMatch(/14:00/);
      expect(log?.body).toContain('en retard');
    });

    it('n’envoie qu’une fois même si le cron passe ensuite (anti-doublon)', async () => {
      const res = await request(app).post('/absences').set(auth(fx.a.teacher.token)).send({
        studentId: fx.a.student.id,
        institutionId: fx.a.institutionId,
        type: 'absence',
        date: '2000-06-15',
        duration: 60,
      });
      expect(res.status).toBe(201);
      const notifCount = await prisma.notification.count({ where: { userId: fx.parentA.id } });

      const cron = await runAbsenceAlertCheck();
      void cron;
      const notifAfter = await prisma.notification.count({ where: { userId: fx.parentA.id } });
      expect(notifAfter).toBe(notifCount);
    });
  });

  describe('filet cron (absences sans alertSentAt)', () => {
    it('alerte le responsable actif ayant le droit canReceiveCommunications', async () => {
      const absenceId = await seedOldUnjustifiedAbsence();
      const notifBefore = await prisma.notification.count({ where: { userId: fx.parentA.id } });

      const result = await runAbsenceAlertCheck();
      expect(result.alertsSent).toBeGreaterThanOrEqual(1);

      const absence = await prisma.strkAbsence.findUnique({ where: { id: absenceId } });
      expect(absence?.alertSentAt).not.toBeNull();

      const notifAfter = await prisma.notification.count({ where: { userId: fx.parentA.id } });
      expect(notifAfter).toBe(notifBefore + 1);

      const log = await prisma.strkCommunicationLog.findFirst({
        where: { recipientId: fx.parentA.id, isCritical: true },
        orderBy: { requestedAt: 'desc' },
      });
      expect(log).not.toBeNull();
      expect(log?.status).toBe('delivered');
      expect(log?.channel).toBe('push');
    });

    it("n'envoie jamais deux fois la même alerte (anti-doublon)", async () => {
      const absenceId = await seedOldUnjustifiedAbsence();
      const first = await runAbsenceAlertCheck();
      expect(first.alertsSent).toBeGreaterThanOrEqual(1);

      const notifCount = await prisma.notification.count({ where: { userId: fx.parentA.id } });
      await runAbsenceAlertCheck();
      const absence = await prisma.strkAbsence.findUnique({ where: { id: absenceId } });
      expect(absence?.alertSentAt).not.toBeNull();
      const notifCountAfter = await prisma.notification.count({ where: { userId: fx.parentA.id } });
      expect(notifCountAfter).toBe(notifCount);
    });

    it('ignore les absences justifiées et les absences trop récentes', async () => {
      const justified = await prisma.strkAbsence.create({
        data: {
          studentId: fx.a.student.id,
          institutionId: fx.a.institutionId,
          type: 'absence',
          date: new Date('2000-01-02'),
          duration: 60,
          justified: true,
          createdBy: fx.a.teacher.id,
        },
      });

      const recent = await prisma.strkAbsence.create({
        data: {
          studentId: fx.a.student.id,
          institutionId: fx.a.institutionId,
          type: 'absence',
          date: new Date(),
          duration: 60,
          justified: false,
          createdBy: fx.a.teacher.id,
        },
      });

      await runAbsenceAlertCheck();

      const justifiedRow = await prisma.strkAbsence.findUnique({ where: { id: justified.id } });
      const recentRow = await prisma.strkAbsence.findUnique({ where: { id: recent.id } });
      expect(justifiedRow?.alertSentAt).toBeNull();
      expect(recentRow?.alertSentAt).toBeNull();
    });

    it('n’alerte pas un responsable dont le droit canReceiveCommunications est désactivé', async () => {
      const silentGuardian = await prisma.strkProfile.create({
        data: {
          email: `silent.guardian.${Date.now()}@isolation.test`,
          role: 'parent',
          firstName: 'Silent',
          lastName: 'Guardian',
        },
      });
      const linkRes = await request(app).post('/guardians').set(auth(fx.a.schoolAdmin.token)).send({
        institutionId: fx.a.institutionId,
        studentId: fx.a.student.id,
        guardianId: silentGuardian.id,
        relationship: 'other_authorized',
        canReceiveCommunications: false,
      });
      expect(linkRes.status).toBe(201);

      await seedOldUnjustifiedAbsence();
      await runAbsenceAlertCheck();

      const notifCount = await prisma.notification.count({ where: { userId: silentGuardian.id } });
      expect(notifCount).toBe(0);
    });
  });

  describe('déclenchement manuel (POST /absences/alert-check)', () => {
    it('réservé à l’admin global', async () => {
      const res = await request(app).post('/absences/alert-check').set(auth(fx.a.schoolAdmin.token));
      expect(res.status).toBe(403);
    });

    it('accessible à l’admin global', async () => {
      const res = await request(app).post('/absences/alert-check').set(auth(fx.globalAdmin.token));
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('checked');
      expect(res.body).toHaveProperty('alertsSent');
    });
  });
});
