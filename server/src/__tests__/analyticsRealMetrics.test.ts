import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { prisma } from '../lib/prisma.js';
import { buildFixture, auth, type Fixture } from './fixtures.js';

/**
 * RPT-003 — en travaillant sur la fraîcheur des données affichées, plusieurs
 * métriques déjà en place se sont révélées fabriquées plutôt que calculées :
 * `estimatedStudents` fixé à 50 (dashboard-metrics), "retards" à 30% du
 * nombre d'absences (weekly-stats), et tout le "Centre d'Analytics"
 * (`useAdvancedAnalytics.tsx`) générant des nombres constants côté client.
 * Cette suite couvre les corrections et les 2 nouveaux endpoints réels.
 */
describe('Métriques analytics réelles (RPT-003)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await buildFixture();
  }, 30000);

  it("dashboard-metrics : le taux d'assiduité reflète le nombre réel d'élèves, pas une constante de 50", async () => {
    // Le fixture n'a qu'un seul élève (fx.a.student) et aucune absence
    // aujourd'hui — avec l'ancienne formule (constante à 50), le taux aurait
    // été calculé sur une base de 50 élèves fictifs au lieu d'un seul réel.
    const res = await request(app)
      .get(`/analytics/dashboard-metrics?institutionId=${fx.a.institutionId}`)
      .set(auth(fx.a.schoolAdmin.token));
    expect(res.status).toBe(200);
    expect(res.body.metrics.students).toBe(1);
    expect(res.body.metrics.attendanceRate).toBe(100);
  });

  it('weekly-stats : "retards" compte les vraies absences de type lateness, jamais 30% des absences', async () => {
    // `weekly-stats` ne couvre que Lundi-Vendredi (DAY_NAMES) : on date les
    // absences sur le lundi de la semaine en cours plutôt que "aujourd'hui",
    // qui peut tomber un week-end (hors de la fenêtre calculée par l'API).
    const monday = new Date();
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const mondayDate = monday.toISOString().split('T')[0];

    const absenceRes = await request(app).post('/absences').set(auth(fx.a.teacher.token)).send({
      studentId: fx.a.student.id,
      institutionId: fx.a.institutionId,
      type: 'absence',
      date: mondayDate,
      duration: 60,
    });
    expect(absenceRes.status).toBe(201);

    const res = await request(app)
      .get(`/analytics/weekly-stats?institutionId=${fx.a.institutionId}`)
      .set(auth(fx.a.schoolAdmin.token));
    expect(res.status).toBe(200);
    // Une seule absence de type "absence", aucune de type "lateness".
    const totalAbsences = res.body.stats.reduce((sum: number, s: any) => sum + s.absences, 0);
    const totalRetards = res.body.stats.reduce((sum: number, s: any) => sum + s.retards, 0);
    expect(totalAbsences).toBe(1);
    expect(totalRetards).toBe(0);

    const latenessRes = await request(app).post('/absences').set(auth(fx.a.teacher.token)).send({
      studentId: fx.a.student.id,
      institutionId: fx.a.institutionId,
      type: 'lateness',
      date: mondayDate,
      duration: 10,
    });
    expect(latenessRes.status).toBe(201);

    const res2 = await request(app)
      .get(`/analytics/weekly-stats?institutionId=${fx.a.institutionId}`)
      .set(auth(fx.a.schoolAdmin.token));
    // Avec l'ancienne fabrication (30% de 2 absences confondues), "retards"
    // aurait valu Math.floor(2 * 0.3) = 0 alors qu'il y a réellement 1 retard.
    const totalAbsences2 = res2.body.stats.reduce((sum: number, s: any) => sum + s.absences, 0);
    const totalRetards2 = res2.body.stats.reduce((sum: number, s: any) => sum + s.retards, 0);
    expect(totalAbsences2).toBe(1);
    expect(totalRetards2).toBe(1);
  });

  it('academic-metrics : moyenne des notes, devoirs rendus, messages et documents réellement calculés', async () => {
    await prisma.strkGrade.create({
      data: {
        studentId: fx.a.student.id,
        courseId: fx.a.courseId,
        teacherId: fx.a.teacher.id,
        gradeValue: 16,
        maxGrade: 20,
        title: 'Contrôle academic-metrics',
        status: 'published',
      },
    });

    const assignment = await prisma.strkAssignment.create({
      data: {
        courseId: fx.a.courseId,
        teacherId: fx.a.teacher.id,
        title: 'Devoir academic-metrics',
        dueDate: new Date(),
      },
    });
    await prisma.strkSubmission.create({
      data: { assignmentId: assignment.id, studentId: fx.a.student.id, submittedAt: new Date(), status: 'submitted' },
    });

    await prisma.strkMessage.create({
      data: { senderId: fx.a.teacher.id, subject: 'Test', content: 'Contenu de test', messageType: 'general' },
    });

    const res = await request(app)
      .get(`/analytics/academic-metrics?institutionId=${fx.a.institutionId}`)
      .set(auth(fx.a.schoolAdmin.token));
    expect(res.status).toBe(200);
    expect(res.body.metrics.averageGrade).toBe(16);
    // 1 seul élève dans la classe du cours, 1 soumission réelle -> 100%.
    expect(res.body.metrics.assignmentCompletionRate).toBe(1);
    expect(res.body.metrics.messagesExchanged).toBeGreaterThanOrEqual(1);
    expect(res.body.generatedAt).toBeTruthy();

    await prisma.strkSubmission.deleteMany({ where: { assignmentId: assignment.id } });
    await prisma.strkAssignment.delete({ where: { id: assignment.id } });
  });

  it("GET /activity : chaque entrée porte le nom réel de son auteur (jointure manuelle userId -> profil)", async () => {
    const activityRes = await request(app)
      .post('/activity')
      .set(auth(fx.a.teacher.token))
      .send({
        type: 'test_event',
        institutionId: fx.a.institutionId,
        userId: fx.a.teacher.id,
        description: 'Événement de test',
      });
    expect(activityRes.status).toBe(201);

    const res = await request(app)
      .get(`/activity?institutionId=${fx.a.institutionId}&limit=50`)
      .set(auth(fx.a.schoolAdmin.token));
    expect(res.status).toBe(200);
    const entry = res.body.activities.find((a: any) => a.id === activityRes.body.activity.id);
    expect(entry).toBeTruthy();
    expect(entry.actor).toBeTruthy();
    expect(entry.actor.id).toBe(fx.a.teacher.id);
  });

  it('institution-ranking : réservé à l’admin global, classe réellement les établissements par assiduité', async () => {
    const asSchoolAdmin = await request(app)
      .get('/analytics/institution-ranking')
      .set(auth(fx.a.schoolAdmin.token));
    expect(asSchoolAdmin.status).toBe(403);

    const res = await request(app).get('/analytics/institution-ranking').set(auth(fx.globalAdmin.token));
    expect(res.status).toBe(200);
    const ids = res.body.ranking.map((r: any) => r.institutionId);
    expect(ids).toContain(fx.a.institutionId);
    expect(ids).toContain(fx.b.institutionId);
    const instA = res.body.ranking.find((r: any) => r.institutionId === fx.a.institutionId);
    expect(instA.totalUsers).toBeGreaterThanOrEqual(3); // school_admin + teacher + student
  });
});
