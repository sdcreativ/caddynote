import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { prisma } from '../lib/prisma.js';
import { runAbsenceAlertCheck } from '../lib/absenceAlertCron.js';
import { buildFixture, auth, type Fixture } from './fixtures.js';

// PRS-004 — alerte parentale automatique après délai. SMS/e-mail ne sont pas
// configurés dans cet environnement de test, donc le canal effectivement
// utilisé est toujours "push" (repli documenté dans absenceAlertCron.ts) :
// vérifié via la création d'une notification interne pour le responsable.
describe('Alerte parentale automatique (PRS-004)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await buildFixture();
  }, 30000);

  const createOldUnjustifiedAbsence = async () => {
    const res = await request(app).post('/absences').set(auth(fx.a.teacher.token)).send({
      studentId: fx.a.student.id,
      institutionId: fx.a.institutionId,
      type: 'absence',
      date: '2000-01-01', // très largement au-delà du délai par défaut (24h)
      duration: 60,
    });
    expect(res.status).toBe(201);
    return res.body.absence.id as string;
  };

  it('alerte le responsable actif ayant le droit canReceiveCommunications', async () => {
    const absenceId = await createOldUnjustifiedAbsence();
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
    const absenceId = await createOldUnjustifiedAbsence();
    const first = await runAbsenceAlertCheck();
    expect(first.alertsSent).toBeGreaterThanOrEqual(1);

    const notifCount = await prisma.notification.count({ where: { userId: fx.parentA.id } });
    const second = await runAbsenceAlertCheck();
    // La seconde exécution ne retraite pas l'absence déjà marquée (alertSentAt posé).
    const absence = await prisma.strkAbsence.findUnique({ where: { id: absenceId } });
    expect(absence?.alertSentAt).not.toBeNull();
    const notifCountAfter = await prisma.notification.count({ where: { userId: fx.parentA.id } });
    expect(notifCountAfter).toBe(notifCount);
    void second;
  });

  it('ignore les absences justifiées et les absences trop récentes', async () => {
    const justified = await request(app).post('/absences').set(auth(fx.a.teacher.token)).send({
      studentId: fx.a.student.id,
      institutionId: fx.a.institutionId,
      type: 'absence',
      date: '2000-01-02',
      duration: 60,
    });
    await request(app).patch(`/absences/${justified.body.absence.id}/review`).set(auth(fx.a.teacher.token)).send({ justified: true });

    const recent = await request(app).post('/absences').set(auth(fx.a.teacher.token)).send({
      studentId: fx.a.student.id,
      institutionId: fx.a.institutionId,
      type: 'absence',
      date: new Date().toISOString().split('T')[0], // aujourd'hui : encore dans le délai
      duration: 60,
    });

    await runAbsenceAlertCheck();

    const justifiedRow = await prisma.strkAbsence.findUnique({ where: { id: justified.body.absence.id } });
    const recentRow = await prisma.strkAbsence.findUnique({ where: { id: recent.body.absence.id } });
    expect(justifiedRow?.alertSentAt).toBeNull();
    expect(recentRow?.alertSentAt).toBeNull();
  });

  it('n’alerte pas un responsable dont le droit canReceiveCommunications est désactivé', async () => {
    const silentGuardian = await prisma.strkProfile.create({
      data: { email: `silent.guardian.${Date.now()}@isolation.test`, role: 'parent', firstName: 'Silent', lastName: 'Guardian' },
    });
    const linkRes = await request(app).post('/guardians').set(auth(fx.a.schoolAdmin.token)).send({
      institutionId: fx.a.institutionId,
      studentId: fx.a.student.id,
      guardianId: silentGuardian.id,
      relationship: 'other_authorized',
      canReceiveCommunications: false,
    });
    expect(linkRes.status).toBe(201);

    await createOldUnjustifiedAbsence();
    await runAbsenceAlertCheck();

    const notifCount = await prisma.notification.count({ where: { userId: silentGuardian.id } });
    expect(notifCount).toBe(0);
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
