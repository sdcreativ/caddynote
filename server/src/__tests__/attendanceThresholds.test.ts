import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { prisma } from '../lib/prisma.js';
import { runAttendanceThresholdCheck } from '../lib/attendanceThresholds.js';
import { buildFixture, registerActor, auth, type Fixture } from './fixtures.js';

/**
 * PRS-006 — seuils d'assiduité (absentéisme, retards répétés) avec
 * détection automatique. SMS/e-mail ne sont pas configurés dans cet
 * environnement de test : le canal effectif est toujours "push" (repli
 * documenté dans lib/communications.ts).
 */
describe('Seuils d’assiduité (PRS-006)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await buildFixture();
  }, 30000);

  const setThresholds = (overrides: Record<string, unknown>) =>
    request(app).patch(`/institutions/${fx.a.institutionId}`).set(auth(fx.a.schoolAdmin.token)).send(overrides);

  // Élève + responsable dédiés à chaque scénario : les alertes de seuil sont
  // un état cumulatif (fenêtre glissante + garde anti-doublon), réutiliser
  // le même élève d'un test à l'autre ferait dépendre chaque test de l'état
  // laissé par les précédents.
  const makeStudentWithGuardian = async () => {
    // /auth/register crée désormais la ligne StrkStudent (lib/roleExtensions.ts,
    // 16/08/2026) — plus besoin de la créer ici à la main.
    const student = await registerActor('student', fx.a.institutionId);
    const guardian = await registerActor('parent');
    const link = await request(app).post('/guardians').set(auth(fx.a.schoolAdmin.token)).send({
      institutionId: fx.a.institutionId,
      studentId: student.id,
      guardianId: guardian.id,
      relationship: 'father',
      canReceiveCommunications: true,
    });
    expect(link.status).toBe(201);
    return { studentId: student.id, guardianId: guardian.id };
  };

  const createAbsence = async (studentId: string, type: 'absence' | 'lateness', daysAgo: number, justified = false) => {
    const date = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const res = await request(app).post('/absences').set(auth(fx.a.teacher.token)).send({
      studentId,
      institutionId: fx.a.institutionId,
      type,
      date,
      duration: 60,
    });
    expect(res.status).toBe(201);
    if (justified) {
      await request(app).patch(`/absences/${res.body.absence.id}/review`).set(auth(fx.a.teacher.token)).send({ justified: true });
    }
    return res.body.absence.id as string;
  };

  it('configure les seuils par établissement (réservé à la direction du même établissement)', async () => {
    const cross = await request(app)
      .patch(`/institutions/${fx.a.institutionId}`)
      .set(auth(fx.b.schoolAdmin.token))
      .send({ absenceThreshold: 3 });
    expect(cross.status).toBe(403);

    const ok = await setThresholds({ absenceThreshold: 3, latenessThreshold: 4, thresholdWindowDays: 30 });
    expect(ok.status).toBe(200);
    expect(ok.body.institution.absenceThreshold).toBe(3);
  });

  it('déclenche une alerte quand le seuil d’absences non justifiées est franchi, avec traçabilité', async () => {
    await setThresholds({ absenceThreshold: 3, latenessThreshold: null });
    const { studentId, guardianId } = await makeStudentWithGuardian();
    await prisma.strkProfile.update({
      where: { id: studentId },
      data: { firstName: 'Inès', lastName: 'Moreau' },
    });
    await createAbsence(studentId, 'absence', 1);
    await createAbsence(studentId, 'absence', 2);
    await createAbsence(studentId, 'absence', 3);

    const staffNotifBefore = await prisma.notification.count({ where: { userId: fx.a.schoolAdmin.id } });
    const guardianNotifBefore = await prisma.notification.count({ where: { userId: guardianId } });

    const result = await runAttendanceThresholdCheck();
    expect(result.alertsSent).toBeGreaterThanOrEqual(1);

    const alert = await prisma.strkThresholdAlert.findFirst({
      where: { studentId, type: 'absence' },
      orderBy: { triggeredAt: 'desc' },
    });
    expect(alert).not.toBeNull();
    expect(alert?.count).toBeGreaterThanOrEqual(3);
    expect(alert?.threshold).toBe(3);

    const staffNotifAfter = await prisma.notification.count({ where: { userId: fx.a.schoolAdmin.id } });
    const guardianNotifAfter = await prisma.notification.count({ where: { userId: guardianId } });
    expect(staffNotifAfter).toBeGreaterThan(staffNotifBefore); // direction notifiée
    expect(guardianNotifAfter).toBeGreaterThan(guardianNotifBefore); // famille notifiée

    const guardianNotif = await prisma.notification.findFirst({
      where: { userId: guardianId },
      orderBy: { createdAt: 'desc' },
    });
    expect(guardianNotif?.title).toContain('Inès Moreau');
    expect(guardianNotif?.message).toContain('Inès Moreau');
    expect(guardianNotif?.message).not.toContain('votre enfant');
  });

  it('ne réalerte pas tant que la fenêtre en cours n’est pas retombée (anti-doublon)', async () => {
    await setThresholds({ absenceThreshold: 2, latenessThreshold: null });
    const { studentId } = await makeStudentWithGuardian();
    await createAbsence(studentId, 'absence', 1);
    await createAbsence(studentId, 'absence', 2);

    const first = await runAttendanceThresholdCheck();
    expect(first.alertsSent).toBeGreaterThanOrEqual(1);

    const alertCountAfterFirst = await prisma.strkThresholdAlert.count({ where: { studentId, type: 'absence' } });

    // Une absence supplémentaire ne redéclenche pas d'alerte immédiatement :
    // une alerte a déjà été émise dans la fenêtre en cours.
    await createAbsence(studentId, 'absence', 1);
    const second = await runAttendanceThresholdCheck();
    const alertCountAfterSecond = await prisma.strkThresholdAlert.count({ where: { studentId, type: 'absence' } });
    expect(alertCountAfterSecond).toBe(alertCountAfterFirst);
    void second;
  });

  it('un seuil de retards distinct fonctionne indépendamment de celui des absences', async () => {
    await setThresholds({ absenceThreshold: null, latenessThreshold: 2 });
    const { studentId } = await makeStudentWithGuardian();
    await createAbsence(studentId, 'lateness', 1);
    await createAbsence(studentId, 'lateness', 2);

    const result = await runAttendanceThresholdCheck();
    expect(result.alertsSent).toBeGreaterThanOrEqual(1);

    const alert = await prisma.strkThresholdAlert.findFirst({ where: { studentId, type: 'lateness' } });
    expect(alert).not.toBeNull();
  });

  it('ignore les absences justifiées et respecte un seuil désactivé (null)', async () => {
    await setThresholds({ absenceThreshold: 1, latenessThreshold: null });
    const { studentId } = await makeStudentWithGuardian();
    await createAbsence(studentId, 'absence', 1, true);

    await runAttendanceThresholdCheck();
    const alert = await prisma.strkThresholdAlert.findFirst({ where: { studentId, type: 'absence' } });
    expect(alert).toBeNull();
  });

  describe('déclenchement manuel et consultation', () => {
    it('POST /absences/threshold-check réservé à l’admin global', async () => {
      const res = await request(app).post('/absences/threshold-check').set(auth(fx.a.schoolAdmin.token));
      expect(res.status).toBe(403);

      const ok = await request(app).post('/absences/threshold-check').set(auth(fx.globalAdmin.token));
      expect(ok.status).toBe(200);
      expect(ok.body).toHaveProperty('checked');
      expect(ok.body).toHaveProperty('alertsSent');
    });

    it('GET /absences/threshold-alerts liste l’historique, avec isolation multi-tenant', async () => {
      await setThresholds({ absenceThreshold: 1, latenessThreshold: null });
      const { studentId } = await makeStudentWithGuardian();
      await createAbsence(studentId, 'absence', 1);
      await runAttendanceThresholdCheck();

      const res = await request(app)
        .get(`/absences/threshold-alerts?institutionId=${fx.a.institutionId}&studentId=${studentId}`)
        .set(auth(fx.a.schoolAdmin.token));
      expect(res.status).toBe(200);
      expect(res.body.alerts.length).toBeGreaterThan(0);

      const cross = await request(app)
        .get(`/absences/threshold-alerts?institutionId=${fx.a.institutionId}`)
        .set(auth(fx.b.schoolAdmin.token));
      expect(cross.status).toBe(403);

      const teacherDenied = await request(app)
        .get(`/absences/threshold-alerts?institutionId=${fx.a.institutionId}`)
        .set(auth(fx.a.teacher.token));
      expect(teacherDenied.status).toBe(403);
    });
  });
});
