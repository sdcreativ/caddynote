import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import crypto from 'node:crypto';
import { app } from '../index.js';
import { buildFixture, auth, type Fixture } from './fixtures.js';
import { fillRequiredAdmissionPacket } from './admissionPacketFill.js';

/**
 * Chap. 8.1/8.2 : préinscription publique et admission.
 */
describe('Préinscription publique et admission (chap. 8)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await buildFixture();
  }, 30000);

  const guardian = () => ({
    firstName: 'Awa',
    lastName: 'Diop',
    email: `parent.${Date.now()}.${Math.random().toString(36).slice(2)}@admissions.test`,
    phone: '+221700000000',
    relationship: 'mother' as const,
  });

  const applicationPayload = (overrides: Record<string, unknown> = {}) => ({
    institutionId: fx.a.institutionId,
    classId: fx.a.classId,
    academicYear: '2026-2027',
    studentFirstName: 'Fatou',
    studentLastName: 'Ndiaye',
    studentBirthDate: '2015-03-10',
    studentGender: 'female',
    guardians: [guardian()],
    contactEmail: `contact.${Date.now()}.${Math.random().toString(36).slice(2)}@admissions.test`,
    ...overrides,
  });

  it('liste publiquement les établissements et les classes, sans authentification', async () => {
    const institutions = await request(app).get('/admissions/institutions');
    expect(institutions.status).toBe(200);
    expect(institutions.body.institutions.some((i: any) => i.id === fx.a.institutionId)).toBe(true);

    const classes = await request(app).get(`/admissions/institutions/${fx.a.institutionId}/classes`);
    expect(classes.status).toBe(200);
    expect(classes.body.classes.some((c: any) => c.id === fx.a.classId)).toBe(true);
  });

  it('dépose un dossier de préinscription sans compte, puis le soumet', async () => {
    const created = await request(app).post('/admissions').send(applicationPayload());
    expect(created.status).toBe(201);
    expect(created.body.application.status).toBe('draft');
    const token = created.body.application.publicToken;

    const statusRes = await request(app).get(`/admissions/status/${token}`);
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.application.status).toBe('draft');
    // Les champs internes ne sont jamais exposés au candidat.
    expect(statusRes.body.application.duplicateWarning).toBeUndefined();

    await fillRequiredAdmissionPacket(app, token);

    const submitRes = await request(app).post(`/admissions/status/${token}/submit`).send({});
    expect(submitRes.status).toBe(200);
    expect(submitRes.body.application.status).toBe('submitted');
    expect(submitRes.body.application.submittedAt).toBeTruthy();

    // Un dossier soumis ne se modifie plus directement par le candidat.
    const patchAfterSubmit = await request(app)
      .patch(`/admissions/status/${token}`)
      .send({ studentFirstName: 'Modifié' });
    expect(patchAfterSubmit.status).toBe(409);
  });

  it('refuse un institutionId ou classId invalide', async () => {
    const badInstitution = await request(app).post('/admissions').send(applicationPayload({ institutionId: crypto.randomUUID() }));
    expect(badInstitution.status).toBe(400);

    const badClass = await request(app)
      .post('/admissions')
      .send(applicationPayload({ classId: fx.b.classId })); // classe d'un autre établissement
    expect(badClass.status).toBe(400);
  });

  it('signale un doublon probable sans jamais bloquer le dépôt', async () => {
    const first = await request(app).post('/admissions').send(
      applicationPayload({ studentFirstName: 'Doublon', studentLastName: 'Test', studentBirthDate: '2016-01-01' })
    );
    expect(first.status).toBe(201);

    const second = await request(app).post('/admissions').send(
      applicationPayload({ studentFirstName: 'Doublon', studentLastName: 'Test', studentBirthDate: '2016-01-01' })
    );
    expect(second.status).toBe(201); // jamais bloquant

    // Le personnel voit l'alerte ; pas le candidat (couvert par le test précédent).
    const asStaff = await request(app)
      .get(`/admissions/${second.body.application.id}`)
      .set(auth(fx.a.schoolAdmin.token));
    expect(asStaff.body.application.duplicateWarning).toBeTruthy();
  });

  it('respecte le workflow de statut : transitions interdites rejetées, isolation multi-tenant appliquée', async () => {
    const created = await request(app).post('/admissions').send(applicationPayload());
    const applicationId = created.body.application.id;
    await fillRequiredAdmissionPacket(app, created.body.application.publicToken);
    await request(app).post(`/admissions/status/${created.body.application.publicToken}/submit`).send({});

    // Un admin de l'établissement B ne peut ni voir ni modifier ce dossier.
    const crossGet = await request(app).get(`/admissions/${applicationId}`).set(auth(fx.b.schoolAdmin.token));
    expect(crossGet.status).toBe(403);
    const crossPatch = await request(app)
      .patch(`/admissions/${applicationId}/status`)
      .set(auth(fx.b.schoolAdmin.token))
      .send({ status: 'rejected' });
    expect(crossPatch.status).toBe(403);

    // On ne saute pas d'étape : submitted -> needs_info -> conditionally_accepted -> enrolled est valide,
    // mais needs_info -> enrolled ne l'est pas directement.
    const toNeedsInfo = await request(app)
      .patch(`/admissions/${applicationId}/status`)
      .set(auth(fx.a.schoolAdmin.token))
      .send({ status: 'needs_info', decisionNotes: 'Merci de fournir un extrait de naissance.' });
    expect(toNeedsInfo.status).toBe(200);
    expect(toNeedsInfo.body.application.decidedBy).toBe(fx.a.schoolAdmin.id);

    const invalidEnroll = await request(app).post(`/admissions/${applicationId}/enroll`).set(auth(fx.a.schoolAdmin.token));
    expect(invalidEnroll.status).toBe(409);

    // Le candidat complète et re-soumet.
    const resubmit = await request(app)
      .post(`/admissions/status/${created.body.application.publicToken}/submit`)
      .send({});
    expect(resubmit.status).toBe(200);
    expect(resubmit.body.application.status).toBe('submitted');
  });

  it('finalise l’inscription : crée l’élève, réutilise/crée les comptes responsables, émet le certificat', async () => {
    const sharedGuardianEmail = `shared.${Date.now()}@admissions.test`;
    const created = await request(app).post('/admissions').send(
      applicationPayload({ guardians: [{ ...guardian(), email: sharedGuardianEmail }] })
    );
    expect(created.body.parentAccountLinked).toBe(true);
    expect(created.body.application.contactProfileId).toBeTruthy();

    const token = created.body.application.publicToken;
    await fillRequiredAdmissionPacket(app, token);
    await request(app).post(`/admissions/status/${token}/submit`).send({});

    const enrollRes = await request(app)
      .post(`/admissions/${created.body.application.id}/enroll`)
      .set(auth(fx.a.schoolAdmin.token));
    expect(enrollRes.status).toBe(201);
    expect(enrollRes.body.studentId).toBeTruthy();
    expect(enrollRes.body.studentNumber).toMatch(/^\d{4}-[0-9A-F]{6}$/);
    expect(enrollRes.body.guardianAccounts).toHaveLength(1);
    // Compte parent déjà créé à la création du dossier — réutilisé à l'enroll.
    expect(enrollRes.body.guardianAccounts[0].created).toBe(false);
    expect(enrollRes.body.documentId).toBeTruthy();

    const statusAfter = await request(app).get(`/admissions/status/${token}`);
    expect(statusAfter.body.application.status).toBe('enrolled');

    // Le certificat de scolarité est un vrai PDF, déjà accessible.
    const doc = await request(app).get(`/documents/${enrollRes.body.documentId}`).set(auth(fx.a.schoolAdmin.token));
    expect(doc.status).toBe(200);
    expect(doc.body.document.type).toBe('enrollment_certificate');

    // Un second enfant du même responsable réutilise le compte existant, n'en crée pas un second.
    const secondChild = await request(app).post('/admissions').send(
      applicationPayload({
        studentFirstName: 'Second',
        studentLastName: 'Enfant',
        studentBirthDate: '2018-06-15',
        guardians: [{ ...guardian(), email: sharedGuardianEmail }],
      })
    );
    await fillRequiredAdmissionPacket(app, secondChild.body.application.publicToken);
    await request(app).post(`/admissions/status/${secondChild.body.application.publicToken}/submit`).send({});
    const secondEnroll = await request(app)
      .post(`/admissions/${secondChild.body.application.id}/enroll`)
      .set(auth(fx.a.schoolAdmin.token));
    expect(secondEnroll.status).toBe(201);
    expect(secondEnroll.body.guardianAccounts[0].created).toBe(false);
  });

  it('confirmation manuelle des frais de dossier — jamais une auto-déclaration du candidat', async () => {
    const created = await request(app).post('/admissions').send(applicationPayload());
    const applicationId = created.body.application.id;

    const setFee = await request(app)
      .post(`/admissions/${applicationId}/fee`)
      .set(auth(fx.a.schoolAdmin.token))
      .send({ applicationFeeCents: 500000 });
    expect(setFee.status).toBe(200);
    expect(setFee.body.application.applicationFeePaid).toBe(false);

    const confirm = await request(app).post(`/admissions/${applicationId}/confirm-fee`).set(auth(fx.a.schoolAdmin.token));
    expect(confirm.status).toBe(200);
    expect(confirm.body.application.applicationFeePaid).toBe(true);
    expect(confirm.body.application.applicationFeeConfirmedBy).toBe(fx.a.schoolAdmin.id);
  });

  it('réinscription : reprend les informations d’un dossier antérieur', async () => {
    const created = await request(app).post('/admissions').send(applicationPayload());
    const applicationId = created.body.application.id;

    const reenroll = await request(app)
      .post(`/admissions/${applicationId}/reenroll`)
      .set(auth(fx.a.schoolAdmin.token))
      .send({ academicYear: '2027-2028' });
    expect(reenroll.status).toBe(201);
    expect(reenroll.body.application.studentFirstName).toBe('Fatou');
    expect(reenroll.body.application.previousApplicationId).toBe(applicationId);
    expect(reenroll.body.application.status).toBe('draft');
    expect(reenroll.body.application.publicToken).not.toBe(created.body.application.publicToken);
  });

  it('un enseignant n’a pas accès à la gestion des admissions (réservé à la direction)', async () => {
    const res = await request(app).get(`/admissions?institutionId=${fx.a.institutionId}`).set(auth(fx.a.teacher.token));
    expect(res.status).toBe(403);
  });

  it('permet de récupérer le suivi par e-mail sans exposer le token', async () => {
    const contactEmail = `recover.${Date.now()}@admissions.test`;
    const created = await request(app).post('/admissions').send(applicationPayload({ contactEmail }));
    expect(created.status).toBe(201);
    expect(typeof created.body.followEmailSent).toBe('boolean');

    const recover = await request(app).post('/admissions/recover').send({ email: contactEmail });
    expect(recover.status).toBe(200);
    expect(recover.body.ok).toBe(true);
    expect(recover.body.emailDeliveryAttempted).toBeUndefined();
    expect(recover.body.emailsSent).toBeUndefined();
    expect(JSON.stringify(recover.body)).not.toContain(created.body.application.publicToken);

    const unknown = await request(app).post('/admissions/recover').send({ email: 'inconnu.jamais@admissions.test' });
    expect(unknown.status).toBe(200);
    expect(unknown.body.ok).toBe(true);
    expect(unknown.body.message).toBe(recover.body.message);
    expect(unknown.body.emailDeliveryAttempted).toBeUndefined();
  });
});
