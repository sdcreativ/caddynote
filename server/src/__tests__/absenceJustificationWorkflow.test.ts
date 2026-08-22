import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { buildFixture, auth, type Fixture } from './fixtures.js';

/**
 * PRS-005 — workflow de validation du justificatif d'absence par le
 * personnel. Le dépôt (`PATCH /absences/:id/justify`) et la décision
 * (`PATCH /absences/:id/review`) existaient déjà séparément et étaient
 * testés indépendamment (voir attendanceThresholds.test.ts,
 * absenceAlertCron.test.ts), mais rien ne vérifiait le cycle complet ni le
 * nouveau champ `justificationStatus`, qui distingue désormais "jamais
 * soumis" de "rejeté" — l'ancien `justified` seul valait `false` dans les
 * deux cas, ce qui empêchait toute UI de proposer une vraie file d'attente
 * de validation au personnel.
 */
describe('Workflow de validation du justificatif (PRS-005)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await buildFixture();
  }, 30000);

  const createAbsence = async () => {
    const res = await request(app).post('/absences').set(auth(fx.a.teacher.token)).send({
      studentId: fx.a.student.id,
      institutionId: fx.a.institutionId,
      type: 'absence',
      date: new Date().toISOString().split('T')[0],
      duration: 60,
    });
    expect(res.status).toBe(201);
    return res.body.absence.id as string;
  };

  it('une absence nouvellement créée est en statut "none" (aucun justificatif déposé)', async () => {
    const id = await createAbsence();
    const list = await request(app).get(`/absences?studentId=${fx.a.student.id}`).set(auth(fx.a.teacher.token));
    const absence = list.body.absences.find((a: { id: string }) => a.id === id);
    expect(absence.justificationStatus).toBe('none');
    expect(absence.justified).toBe(false);
  });

  it('le dépôt (élève) passe le statut à "pending", sans trancher `justified`', async () => {
    const id = await createAbsence();
    const res = await request(app)
      .patch(`/absences/${id}/justify`)
      .set(auth(fx.a.student.token))
      .send({ justification: "Rendez-vous médical" });
    expect(res.status).toBe(200);
    expect(res.body.absence.justificationStatus).toBe('pending');
    expect(res.body.absence.justified).toBe(false);
  });

  it('le dépôt (parent avec canViewAttendance) est aussi autorisé', async () => {
    const id = await createAbsence();
    const res = await request(app)
      .patch(`/absences/${id}/justify`)
      .set(auth(fx.parentA.token))
      .send({ justification: 'Absence familiale' });
    expect(res.status).toBe(200);
    expect(res.body.absence.justificationStatus).toBe('pending');
  });

  it('un tiers sans lien avec l’élève ne peut pas déposer de justificatif', async () => {
    const id = await createAbsence();
    const res = await request(app)
      .patch(`/absences/${id}/justify`)
      .set(auth(fx.b.teacher.token))
      .send({ justification: 'Non autorisé' });
    expect(res.status).toBe(403);
  });

  it('le personnel accepte : statut "accepted", `justified=true`, décideur et horodatage renseignés', async () => {
    const id = await createAbsence();
    await request(app).patch(`/absences/${id}/justify`).set(auth(fx.a.student.token)).send({ justification: 'Malade' });

    const res = await request(app)
      .patch(`/absences/${id}/review`)
      .set(auth(fx.a.teacher.token))
      .send({ justified: true });
    expect(res.status).toBe(200);
    expect(res.body.absence.justificationStatus).toBe('accepted');
    expect(res.body.absence.justified).toBe(true);
    expect(res.body.absence.justificationReviewedBy).toBe(fx.a.teacher.id);
    expect(res.body.absence.justificationReviewedAt).not.toBeNull();
  });

  it('le personnel rejette : statut "rejected", `justified` reste false — distinct de "jamais soumis"', async () => {
    const id = await createAbsence();
    await request(app).patch(`/absences/${id}/justify`).set(auth(fx.a.student.token)).send({ justification: 'Motif contesté' });

    const res = await request(app)
      .patch(`/absences/${id}/review`)
      .set(auth(fx.a.teacher.token))
      .send({ justified: false });
    expect(res.status).toBe(200);
    expect(res.body.absence.justificationStatus).toBe('rejected');
    expect(res.body.absence.justified).toBe(false);

    // Le seul champ hérité `justified` ne permettait pas de le distinguer
    // d'une absence dont personne n'a jamais rien déposé.
    const untouched = await createAbsence();
    const list = await request(app).get(`/absences?studentId=${fx.a.student.id}`).set(auth(fx.a.teacher.token));
    const rejected = list.body.absences.find((a: { id: string }) => a.id === id);
    const neverSubmitted = list.body.absences.find((a: { id: string }) => a.id === untouched);
    expect(rejected.justified).toBe(neverSubmitted.justified); // false === false
    expect(rejected.justificationStatus).not.toBe(neverSubmitted.justificationStatus); // rejected !== none
  });

  it('un nouveau dépôt après rejet repasse en "pending" (jamais auto-accepté)', async () => {
    const id = await createAbsence();
    await request(app).patch(`/absences/${id}/justify`).set(auth(fx.a.student.token)).send({ justification: 'Premier essai' });
    await request(app).patch(`/absences/${id}/review`).set(auth(fx.a.teacher.token)).send({ justified: false });

    const resubmit = await request(app)
      .patch(`/absences/${id}/justify`)
      .set(auth(fx.a.student.token))
      .send({ justification: 'Nouveau justificatif avec pièce jointe' });
    expect(resubmit.status).toBe(200);
    expect(resubmit.body.absence.justificationStatus).toBe('pending');
    expect(resubmit.body.absence.justified).toBe(false);
  });

  it("le personnel d'un autre établissement ne peut pas trancher un justificatif (ORG-004)", async () => {
    const id = await createAbsence();
    await request(app).patch(`/absences/${id}/justify`).set(auth(fx.a.student.token)).send({ justification: 'Motif' });

    const res = await request(app)
      .patch(`/absences/${id}/review`)
      .set(auth(fx.b.teacher.token))
      .send({ justified: true });
    expect(res.status).toBe(404);
  });

  it('un élève ne peut pas trancher lui-même son propre justificatif (rôle insuffisant)', async () => {
    const id = await createAbsence();
    await request(app).patch(`/absences/${id}/justify`).set(auth(fx.a.student.token)).send({ justification: 'Motif' });

    const res = await request(app)
      .patch(`/absences/${id}/review`)
      .set(auth(fx.a.student.token))
      .send({ justified: true });
    expect(res.status).toBe(403);
  });
});
