import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { prisma } from '../lib/prisma.js';
import { notifyAssignmentPublished, runAssignmentReminderCheck } from '../lib/assignmentReminders.js';
import { buildFixture, auth, type Fixture } from './fixtures.js';

/**
 * PED-005 — rappels de devoir (publication, échéance proche, retard),
 * débloqué par le module Communication (COM-001 à 005). SMS/e-mail ne sont
 * pas configurés dans cet environnement de test : le canal effectif est
 * toujours "push" (repli documenté dans lib/communications.ts).
 *
 * `notifyAssignmentPublished`/`runAssignmentReminderCheck` sont appelés
 * directement (pas seulement via HTTP) pour des assertions déterministes —
 * la notification de publication déclenchée par `POST /assignments` est
 * volontairement fire-and-forget (ne bloque jamais la réponse), couverte
 * séparément par un test qui patiente sur l'effet asynchrone.
 */
describe('Rappels de devoirs (PED-005)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await buildFixture();
  }, 30000);

  // Créé directement en base (pas via POST /assignments) : la route
  // déclenche elle-même une notification de publication asynchrone
  // (fire-and-forget, cf. assignments.routes.ts), ce qui entrerait en
  // course avec les appels directs à `notifyAssignmentPublished` ci-dessous
  // dans ces tests. Le déclenchement réel par la route est vérifié à part.
  const createAssignment = async (dueDateOverride?: string) => {
    const assignment = await prisma.strkAssignment.create({
      data: {
        courseId: fx.a.courseId,
        teacherId: fx.a.teacher.id,
        title: `Devoir ${Date.now()}-${Math.random().toString(36).slice(2)}`,
        dueDate: new Date(dueDateOverride ?? new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString()),
      },
    });
    return assignment.id;
  };

  describe('publication', () => {
    it('notifie chaque élève de la classe du cours', async () => {
      const assignmentId = await createAssignment();
      const notifBefore = await prisma.notification.count({ where: { userId: fx.a.student.id } });

      const result = await notifyAssignmentPublished(assignmentId);
      expect(result.sent).toBeGreaterThanOrEqual(1);

      const notifAfter = await prisma.notification.count({ where: { userId: fx.a.student.id } });
      expect(notifAfter).toBe(notifBefore + 1);

      const reminder = await prisma.strkAssignmentReminder.findUnique({
        where: { assignmentId_studentId_type: { assignmentId, studentId: fx.a.student.id, type: 'published' } },
      });
      expect(reminder).not.toBeNull();
    });

    it('notifie aussi le responsable lié (canReceiveCommunications)', async () => {
      const assignmentId = await createAssignment();
      const parentBefore = await prisma.notification.count({ where: { userId: fx.parentA.id } });

      await notifyAssignmentPublished(assignmentId);

      const parentAfter = await prisma.notification.count({ where: { userId: fx.parentA.id } });
      expect(parentAfter).toBe(parentBefore + 1);
    });

    it("n'envoie jamais deux fois la notification de publication (anti-doublon)", async () => {
      const assignmentId = await createAssignment();
      await notifyAssignmentPublished(assignmentId);
      const notifCount = await prisma.notification.count({ where: { userId: fx.a.student.id } });

      const second = await notifyAssignmentPublished(assignmentId);
      expect(second.sent).toBe(0);
      const notifCountAfter = await prisma.notification.count({ where: { userId: fx.a.student.id } });
      expect(notifCountAfter).toBe(notifCount);
    });

    it('POST /assignments déclenche la notification de publication (asynchrone, sans bloquer la réponse)', async () => {
      const res = await request(app).post('/assignments').set(auth(fx.a.teacher.token)).send({
        courseId: fx.a.courseId,
        teacherId: fx.a.teacher.id,
        title: 'Devoir via HTTP',
        dueDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
      });
      expect(res.status).toBe(201);

      // Effet asynchrone (fire-and-forget) : on patiente un court instant
      // borné plutôt que de supposer qu'il a déjà eu lieu à ce stade.
      let reminder = null;
      for (let attempt = 0; attempt < 20 && !reminder; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        reminder = await prisma.strkAssignmentReminder.findUnique({
          where: { assignmentId_studentId_type: { assignmentId: res.body.assignment.id, studentId: fx.a.student.id, type: 'published' } },
        });
      }
      expect(reminder).not.toBeNull();
    });
  });

  describe('échéance proche et retard', () => {
    it('rappelle un devoir dont l’échéance approche, uniquement aux élèves n’ayant pas encore rendu', async () => {
      const dueSoon = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(); // dans 2h, sous la fenêtre par défaut (24h)
      const assignmentId = await createAssignment(dueSoon);

      // fx.a.student rend son devoir avant l'échéance : ne doit pas être rappelé.
      const submitRes = await request(app).post('/assignments/submissions').set(auth(fx.a.student.token)).send({
        assignmentId,
        studentId: fx.a.student.id,
        content: 'Fait',
      });
      expect(submitRes.status).toBe(201);

      const result = await runAssignmentReminderCheck();
      expect(result.checked).toBeGreaterThanOrEqual(1);

      const reminder = await prisma.strkAssignmentReminder.findUnique({
        where: { assignmentId_studentId_type: { assignmentId, studentId: fx.a.student.id, type: 'due_soon' } },
      });
      expect(reminder).toBeNull(); // déjà rendu, jamais rappelé
    });

    it('rappelle un devoir en retard aux élèves n’ayant toujours pas rendu, une seule fois', async () => {
      const overdue = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(); // il y a 3 jours
      const assignmentId = await createAssignment(overdue);

      const notifBefore = await prisma.notification.count({ where: { userId: fx.a.student.id } });
      const first = await runAssignmentReminderCheck();
      expect(first.remindersSent).toBeGreaterThanOrEqual(1);
      const notifAfter = await prisma.notification.count({ where: { userId: fx.a.student.id } });
      expect(notifAfter).toBe(notifBefore + 1);

      // Une seconde exécution ne rappelle pas à nouveau (anti-doublon).
      const second = await runAssignmentReminderCheck();
      const notifCountAfter = await prisma.notification.count({ where: { userId: fx.a.student.id } });
      expect(notifCountAfter).toBe(notifAfter);
      void second;

      const reminder = await prisma.strkAssignmentReminder.findUnique({
        where: { assignmentId_studentId_type: { assignmentId, studentId: fx.a.student.id, type: 'overdue' } },
      });
      expect(reminder).not.toBeNull();
    });

    it('rappelle le responsable une seule fois (pas à chaque passage du cron)', async () => {
      const overdue = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
      const assignmentId = await createAssignment(overdue);

      const parentBefore = await prisma.notification.count({ where: { userId: fx.parentA.id } });
      await runAssignmentReminderCheck();
      const parentAfter = await prisma.notification.count({ where: { userId: fx.parentA.id } });
      expect(parentAfter).toBe(parentBefore + 1);

      await runAssignmentReminderCheck();
      const parentAgain = await prisma.notification.count({ where: { userId: fx.parentA.id } });
      expect(parentAgain).toBe(parentAfter);
    });

    it('ne notifie pas un responsable qui a refusé les communications', async () => {
      await prisma.strkStudentGuardian.updateMany({
        where: { studentId: fx.a.student.id, guardianId: fx.parentA.id },
        data: { canReceiveCommunications: false },
      });
      const overdue = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();
      const assignmentId = await createAssignment(overdue);
      const parentBefore = await prisma.notification.count({ where: { userId: fx.parentA.id } });
      await runAssignmentReminderCheck();
      const parentAfter = await prisma.notification.count({ where: { userId: fx.parentA.id } });
      expect(parentAfter).toBe(parentBefore);

      await prisma.strkStudentGuardian.updateMany({
        where: { studentId: fx.a.student.id, guardianId: fx.parentA.id },
        data: { canReceiveCommunications: true },
      });
      void assignmentId;
    });

    it('ignore un devoir dont l’échéance est trop lointaine', async () => {
      const farFuture = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString();
      const assignmentId = await createAssignment(farFuture);

      await runAssignmentReminderCheck();
      const reminder = await prisma.strkAssignmentReminder.findFirst({ where: { assignmentId } });
      expect(reminder).toBeNull();
    });
  });

  describe('déclenchement manuel (POST /assignments/reminder-check)', () => {
    it('réservé à l’admin global', async () => {
      const res = await request(app).post('/assignments/reminder-check').set(auth(fx.a.schoolAdmin.token));
      expect(res.status).toBe(403);
    });

    it('accessible à l’admin global', async () => {
      const res = await request(app).post('/assignments/reminder-check').set(auth(fx.globalAdmin.token));
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('checked');
      expect(res.body).toHaveProperty('remindersSent');
    });
  });
});
