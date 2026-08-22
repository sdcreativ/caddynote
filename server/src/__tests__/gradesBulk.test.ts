import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { prisma } from '../lib/prisma.js';
import { buildFixture, registerActor, auth, type Fixture } from './fixtures.js';

/**
 * EVA-003 — saisie en grille. `POST /grades` ne créait qu'une note à la
 * fois ; un enseignant devant saisir un devoir pour toute une classe devait
 * répéter l'appel élève par élève. `POST /grades/bulk` couvre la grille
 * (un devoir, plusieurs élèves, un seul envoi) — l'import (fichier externe)
 * n'est pas couvert, seule la grille l'est.
 */
describe('Saisie de notes en grille (EVA-003)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await buildFixture();
  }, 30000);

  // /auth/register crée désormais la ligne StrkStudent (lib/roleExtensions.ts,
  // 16/08/2026) — plus besoin de la créer ici à la main.
  const makeStudent = async () => registerActor('student', fx.a.institutionId);

  it('crée une note en brouillon pour chaque élève de la grille en un seul envoi', async () => {
    const s1 = await makeStudent();
    const s2 = await makeStudent();
    const s3 = await makeStudent();

    const res = await request(app).post('/grades/bulk').set(auth(fx.a.teacher.token)).send({
      courseId: fx.a.courseId,
      teacherId: fx.a.teacher.id,
      periodId: fx.a.periodId,
      title: 'Contrôle commun',
      maxGrade: 20,
      entries: [
        { studentId: s1.id, gradeValue: 12 },
        { studentId: s2.id, gradeValue: 18 },
        { studentId: s3.id, gradeValue: 7 },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.count).toBe(3);

    const grades = await prisma.strkGrade.findMany({ where: { studentId: { in: [s1.id, s2.id, s3.id] }, title: 'Contrôle commun' } });
    expect(grades).toHaveLength(3);
    expect(grades.every((g) => g.status === 'draft')).toBe(true);
    const bys1 = grades.find((g) => g.studentId === s1.id);
    expect(Number(bys1?.gradeValue)).toBe(12);
  });

  it("rejette la grille si un élève n'appartient pas à l'établissement (ORG-004)", async () => {
    const foreignStudent = await registerActor('student', fx.b.institutionId);
    const localStudent = await makeStudent();

    const res = await request(app).post('/grades/bulk').set(auth(fx.a.teacher.token)).send({
      courseId: fx.a.courseId,
      teacherId: fx.a.teacher.id,
      periodId: fx.a.periodId,
      title: 'Grille invalide',
      entries: [
        { studentId: localStudent.id, gradeValue: 10 },
        { studentId: foreignStudent.id, gradeValue: 10 },
      ],
    });
    expect(res.status).toBe(400);
    expect(res.body.invalidIds).toContain(foreignStudent.id);

    // Aucune note ne doit avoir été créée — tout ou rien, pas une grille à moitié injectée.
    const grades = await prisma.strkGrade.findMany({ where: { title: 'Grille invalide' } });
    expect(grades).toHaveLength(0);
  });

  it("le personnel d'un autre établissement ne peut pas saisir une grille (ORG-004)", async () => {
    const student = await makeStudent();
    const res = await request(app).post('/grades/bulk').set(auth(fx.b.teacher.token)).send({
      courseId: fx.a.courseId,
      teacherId: fx.b.teacher.id,
      periodId: fx.a.periodId,
      title: 'Grille étrangère',
      entries: [{ studentId: student.id, gradeValue: 10 }],
    });
    expect(res.status).toBe(403);
  });

  it('un élève ne peut pas saisir de grille (rôle insuffisant)', async () => {
    const res = await request(app).post('/grades/bulk').set(auth(fx.a.student.token)).send({
      courseId: fx.a.courseId,
      teacherId: fx.a.teacher.id,
      periodId: fx.a.periodId,
      title: 'Grille non autorisée',
      entries: [{ studentId: fx.a.student.id, gradeValue: 10 }],
    });
    expect(res.status).toBe(403);
  });
});
