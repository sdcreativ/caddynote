import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { buildFixture, auth, registerActor, type Fixture, type Actor } from './fixtures.js';

/**
 * SUI-001 à 005 : observations pédagogiques, incidents disciplinaires,
 * workflow, confidentialité ciblée et isolation multi-tenant.
 */
describe('Suivi pédagogique et discipline (SUI-001 à 005)', () => {
  let fx: Fixture;
  let teacher2: Actor; // second enseignant de l'établissement A, pour les tests de confidentialité

  beforeAll(async () => {
    fx = await buildFixture();
    // /auth/register crée désormais la ligne StrkTeacher (lib/roleExtensions.ts,
    // 16/08/2026) — plus besoin de la créer ici à la main.
    teacher2 = await registerActor('teacher', fx.a.institutionId);
  }, 30000);

  describe('Observations pédagogiques (SUI-001/002)', () => {
    it('un enseignant crée une observation, visible par défaut de tout le personnel de l’établissement', async () => {
      const res = await request(app).post('/observations').set(auth(fx.a.teacher.token)).send({
        studentId: fx.a.student.id,
        category: 'positive',
        title: 'Bonne participation',
        description: 'Très investi en classe cette semaine.',
      });
      expect(res.status).toBe(201);
      expect(res.body.observation.visibleToFamily).toBe(false);

      const asSchoolAdmin = await request(app)
        .get(`/observations?studentId=${fx.a.student.id}`)
        .set(auth(fx.a.schoolAdmin.token));
      expect(asSchoolAdmin.body.observations.some((o: any) => o.id === res.body.observation.id)).toBe(true);
    });

    it('refuse la création pour un élève d’un autre établissement', async () => {
      const res = await request(app).post('/observations').set(auth(fx.b.teacher.token)).send({
        studentId: fx.a.student.id,
        title: 'Intrusion',
        description: 'x',
      });
      expect(res.status).toBe(404);
    });

    it('la confidentialité ciblée masque une observation aux autres enseignants, mais jamais à la direction', async () => {
      const created = await request(app).post('/observations').set(auth(fx.a.teacher.token)).send({
        studentId: fx.a.student.id,
        title: 'Note confidentielle',
        description: 'Réservée à un cercle restreint.',
        restrictedToUserIds: [fx.a.teacher.id],
      });
      const observationId = created.body.observation.id;

      // L'auteur voit sa propre note.
      const asAuthor = await request(app).get(`/observations?studentId=${fx.a.student.id}`).set(auth(fx.a.teacher.token));
      expect(asAuthor.body.observations.some((o: any) => o.id === observationId)).toBe(true);

      // Un autre enseignant, non listé, ne la voit pas.
      const asOtherTeacher = await request(app).get(`/observations?studentId=${fx.a.student.id}`).set(auth(teacher2.token));
      expect(asOtherTeacher.body.observations.some((o: any) => o.id === observationId)).toBe(false);

      // La direction la voit malgré la restriction (autorité de dernier ressort).
      const asSchoolAdmin = await request(app)
        .get(`/observations?studentId=${fx.a.student.id}`)
        .set(auth(fx.a.schoolAdmin.token));
      expect(asSchoolAdmin.body.observations.some((o: any) => o.id === observationId)).toBe(true);
    });

    it('une observation n’est visible de la famille que si explicitement partagée', async () => {
      const created = await request(app).post('/observations').set(auth(fx.a.teacher.token)).send({
        studentId: fx.a.student.id,
        title: 'Pas encore partagée',
        description: 'x',
      });
      const observationId = created.body.observation.id;

      const beforeShare = await request(app)
        .get(`/observations?studentId=${fx.a.student.id}`)
        .set(auth(fx.parentA.token));
      expect(beforeShare.body.observations.some((o: any) => o.id === observationId)).toBe(false);

      const patchRes = await request(app)
        .patch(`/observations/${observationId}`)
        .set(auth(fx.a.teacher.token))
        .send({ visibleToFamily: true });
      expect(patchRes.status).toBe(200);

      const afterShare = await request(app)
        .get(`/observations?studentId=${fx.a.student.id}`)
        .set(auth(fx.parentA.token));
      expect(afterShare.body.observations.some((o: any) => o.id === observationId)).toBe(true);

      // L'élève lui-même la voit aussi, une fois partagée.
      const asStudent = await request(app)
        .get(`/observations?studentId=${fx.a.student.id}`)
        .set(auth(fx.a.student.token));
      expect(asStudent.body.observations.some((o: any) => o.id === observationId)).toBe(true);
    });

    it('un responsable sans le droit canViewDiscipline ne voit rien, même partagé', async () => {
      const guardians = await request(app).get(`/guardians/for-student/${fx.a.student.id}`).set(auth(fx.a.schoolAdmin.token));
      const linkId = guardians.body.guardians.find((g: any) => g.guardian.id === fx.parentA.id).id;
      await request(app).patch(`/guardians/${linkId}`).set(auth(fx.a.schoolAdmin.token)).send({ canViewDiscipline: false });

      const created = await request(app).post('/observations').set(auth(fx.a.teacher.token)).send({
        studentId: fx.a.student.id,
        title: 'Partagée mais droit retiré',
        description: 'x',
        visibleToFamily: true,
      });
      const res = await request(app).get(`/observations?studentId=${fx.a.student.id}`).set(auth(fx.parentA.token));
      expect(res.body.observations.some((o: any) => o.id === created.body.observation.id)).toBe(false);

      // On restaure le droit pour ne pas polluer les tests suivants.
      await request(app).patch(`/guardians/${linkId}`).set(auth(fx.a.schoolAdmin.token)).send({ canViewDiscipline: true });
    });

    it('seul l’auteur (ou la direction) peut modifier/supprimer une observation', async () => {
      const created = await request(app).post('/observations').set(auth(fx.a.teacher.token)).send({
        studentId: fx.a.student.id,
        title: 'À protéger',
        description: 'x',
      });
      const observationId = created.body.observation.id;

      const patchByOther = await request(app)
        .patch(`/observations/${observationId}`)
        .set(auth(teacher2.token))
        .send({ title: 'Modifiée par un tiers' });
      expect(patchByOther.status).toBe(403);

      const deleteByOther = await request(app).delete(`/observations/${observationId}`).set(auth(teacher2.token));
      expect(deleteByOther.status).toBe(403);

      const deleteByAdmin = await request(app).delete(`/observations/${observationId}`).set(auth(fx.a.schoolAdmin.token));
      expect(deleteByAdmin.status).toBe(200);
    });
  });

  describe('Incidents disciplinaires — workflow (SUI-003/004)', () => {
    it('un incident naît "reported" et suit un enchaînement de statuts strict', async () => {
      const created = await request(app).post('/discipline/incidents').set(auth(fx.a.teacher.token)).send({
        studentId: fx.a.student.id,
        description: 'Perturbation en classe',
        severity: 'moderate',
      });
      expect(created.status).toBe(201);
      expect(created.body.incident.status).toBe('reported');
      const incidentId = created.body.incident.id;

      // Un enseignant ne peut pas faire avancer le workflow — réservé à la direction.
      const byTeacher = await request(app)
        .patch(`/discipline/incidents/${incidentId}/status`)
        .set(auth(fx.a.teacher.token))
        .send({ status: 'under_review' });
      expect(byTeacher.status).toBe(403);

      // Transition invalide : on ne saute pas d'étape.
      const invalidJump = await request(app)
        .patch(`/discipline/incidents/${incidentId}/status`)
        .set(auth(fx.a.schoolAdmin.token))
        .send({ status: 'resolved' });
      expect(invalidJump.status).toBe(409);

      const toReview = await request(app)
        .patch(`/discipline/incidents/${incidentId}/status`)
        .set(auth(fx.a.schoolAdmin.token))
        .send({ status: 'under_review' });
      expect(toReview.status).toBe(200);
      expect(toReview.body.incident.status).toBe('under_review');

      // La décision n'est pas encore possible : pas renvoyé en conseil.
      const decisionTooEarly = await request(app)
        .post(`/discipline/incidents/${incidentId}/decision`)
        .set(auth(fx.a.schoolAdmin.token))
        .send({ decision: 'Avertissement' });
      expect(decisionTooEarly.status).toBe(409);

      const toCouncil = await request(app)
        .patch(`/discipline/incidents/${incidentId}/status`)
        .set(auth(fx.a.schoolAdmin.token))
        .send({ status: 'council_referred' });
      expect(toCouncil.status).toBe(200);
      expect(toCouncil.body.incident.councilDate).toBeTruthy();

      const decision = await request(app)
        .post(`/discipline/incidents/${incidentId}/decision`)
        .set(auth(fx.a.schoolAdmin.token))
        .send({ decision: 'Avertissement écrit', sanctionType: 'warning' });
      expect(decision.status).toBe(200);
      expect(decision.body.incident.status).toBe('resolved');
      expect(decision.body.incident.decidedBy).toBe(fx.a.schoolAdmin.id);

      // Un dossier clos ne repart plus en arrière.
      const reopen = await request(app)
        .patch(`/discipline/incidents/${incidentId}/status`)
        .set(auth(fx.a.schoolAdmin.token))
        .send({ status: 'under_review' });
      expect(reopen.status).toBe(409);
    });

    it('un incident mineur peut être clos directement sans passer par le conseil', async () => {
      const created = await request(app).post('/discipline/incidents').set(auth(fx.a.teacher.token)).send({
        studentId: fx.a.student.id,
        description: 'Oubli de matériel',
        severity: 'minor',
      });
      await request(app)
        .patch(`/discipline/incidents/${created.body.incident.id}/status`)
        .set(auth(fx.a.schoolAdmin.token))
        .send({ status: 'under_review' });
      const resolved = await request(app)
        .patch(`/discipline/incidents/${created.body.incident.id}/status`)
        .set(auth(fx.a.schoolAdmin.token))
        .send({ status: 'resolved' });
      expect(resolved.status).toBe(200);
    });

    it('isolation multi-tenant : un admin de B ne peut ni signaler ni faire avancer un incident de A', async () => {
      const created = await request(app).post('/discipline/incidents').set(auth(fx.a.teacher.token)).send({
        studentId: fx.a.student.id,
        description: 'Pour test isolation',
      });

      const crossReport = await request(app).post('/discipline/incidents').set(auth(fx.b.schoolAdmin.token)).send({
        studentId: fx.a.student.id,
        description: 'Intrusion',
      });
      expect(crossReport.status).toBe(404);

      const crossTransition = await request(app)
        .patch(`/discipline/incidents/${created.body.incident.id}/status`)
        .set(auth(fx.b.schoolAdmin.token))
        .send({ status: 'under_review' });
      expect(crossTransition.status).toBe(403);

      const crossList = await request(app)
        .get(`/discipline/incidents?studentId=${fx.a.student.id}`)
        .set(auth(fx.b.teacher.token));
      expect(crossList.status).toBe(403);
    });

    it('confidentialité ciblée : la famille ne voit un incident que si explicitement partagé', async () => {
      const created = await request(app).post('/discipline/incidents').set(auth(fx.a.teacher.token)).send({
        studentId: fx.a.student.id,
        description: 'Incident non partagé avec la famille',
      });
      const incidentId = created.body.incident.id;

      const before = await request(app)
        .get(`/discipline/incidents?studentId=${fx.a.student.id}`)
        .set(auth(fx.parentA.token));
      expect(before.body.incidents.some((i: any) => i.id === incidentId)).toBe(false);

      const shareRes = await request(app)
        .patch(`/discipline/incidents/${incidentId}/confidentiality`)
        .set(auth(fx.a.schoolAdmin.token))
        .send({ visibleToFamily: true });
      expect(shareRes.status).toBe(200);

      const after = await request(app)
        .get(`/discipline/incidents?studentId=${fx.a.student.id}`)
        .set(auth(fx.parentA.token));
      expect(after.body.incidents.some((i: any) => i.id === incidentId)).toBe(true);

      // Un enseignant ne peut pas modifier la confidentialité — réservé à la direction.
      const byTeacher = await request(app)
        .patch(`/discipline/incidents/${incidentId}/confidentiality`)
        .set(auth(fx.a.teacher.token))
        .send({ visibleToFamily: false });
      expect(byTeacher.status).toBe(403);
    });
  });

  describe('Dossier de suivi individuel (SUI-001)', () => {
    it('réunit observations et incidents visibles dans une seule chronologie', async () => {
      const obsRes = await request(app).post('/observations').set(auth(fx.a.teacher.token)).send({
        studentId: fx.a.student.id,
        title: 'Pour la chronologie',
        description: 'x',
        visibleToFamily: true,
      });
      const incidentRes = await request(app).post('/discipline/incidents').set(auth(fx.a.teacher.token)).send({
        studentId: fx.a.student.id,
        description: 'Pour la chronologie aussi',
        visibleToFamily: true,
      });

      const timeline = await request(app)
        .get(`/observations/timeline?studentId=${fx.a.student.id}`)
        .set(auth(fx.a.schoolAdmin.token));
      expect(timeline.status).toBe(200);
      const kinds = new Set(timeline.body.timeline.map((t: any) => t.kind));
      expect(kinds.has('observation')).toBe(true);
      expect(kinds.has('incident')).toBe(true);
      expect(timeline.body.timeline.some((t: any) => t.entry.id === obsRes.body.observation.id)).toBe(true);
      expect(timeline.body.timeline.some((t: any) => t.entry.id === incidentRes.body.incident.id)).toBe(true);
    });
  });
});
