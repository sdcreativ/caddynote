import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { buildFixture, auth, type Fixture } from './fixtures.js';

/**
 * SAA-006 (Lot 10) — support client structuré. Jusqu'ici totalement absent
 * (les tableaux de bord admin existants — `CriticalAlertsCenter`,
 * `LogsCenter` — sont de la supervision technique, pas un canal de support
 * client). Tickets + fil de messages, priorité, statut, notes internes.
 */
describe('Support client (SAA-006)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await buildFixture();
  }, 30000);

  it('un enseignant ouvre un ticket avec un premier message', async () => {
    const res = await request(app)
      .post('/support/tickets')
      .set(auth(fx.a.teacher.token))
      .send({ subject: 'Impossible de publier une note', body: 'Le bouton Publier ne répond pas.', priority: 'high' });
    expect(res.status).toBe(201);
    expect(res.body.ticket.status).toBe('open');
    expect(res.body.ticket.priority).toBe('high');

    const detail = await request(app).get(`/support/tickets/${res.body.ticket.id}`).set(auth(fx.a.teacher.token));
    expect(detail.status).toBe(200);
    expect(detail.body.messages).toHaveLength(1);
    expect(detail.body.messages[0].body).toContain('Publier');
  });

  it('le personnel du même établissement voit le ticket ; un autre établissement non', async () => {
    const created = await request(app)
      .post('/support/tickets')
      .set(auth(fx.a.student.token))
      .send({ subject: 'Mot de passe oublié', body: 'Je ne reçois pas le mail.' });
    const ticketId = created.body.ticket.id;

    const sameSchool = await request(app).get(`/support/tickets/${ticketId}`).set(auth(fx.a.schoolAdmin.token));
    expect(sameSchool.status).toBe(200);

    const otherSchool = await request(app).get(`/support/tickets/${ticketId}`).set(auth(fx.b.schoolAdmin.token));
    expect(otherSchool.status).toBe(403);

    const unrelatedStudent = await request(app).get(`/support/tickets/${ticketId}`).set(auth(fx.b.student.token));
    expect(unrelatedStudent.status).toBe(403);
  });

  it('un élève ne voit que ses propres tickets dans la liste, jamais ceux d’un autre', async () => {
    await request(app)
      .post('/support/tickets')
      .set(auth(fx.a.student.token))
      .send({ subject: 'Autre problème élève', body: 'Détails.' });

    const res = await request(app).get('/support/tickets').set(auth(fx.a.student.token));
    expect(res.status).toBe(200);
    expect(res.body.tickets.length).toBeGreaterThan(0);
    expect(res.body.tickets.every((t: any) => t.createdBy === fx.a.student.id)).toBe(true);
  });

  it('le personnel de l’établissement voit tous les tickets de son établissement dans la liste', async () => {
    const res = await request(app).get('/support/tickets').set(auth(fx.a.schoolAdmin.token));
    expect(res.status).toBe(200);
    expect(res.body.tickets.every((t: any) => t.institutionId === fx.a.institutionId)).toBe(true);
    expect(res.body.tickets.length).toBeGreaterThanOrEqual(2);
  });

  it('l’admin global voit les tickets de tous les établissements', async () => {
    const res = await request(app).get('/support/tickets').set(auth(fx.globalAdmin.token));
    expect(res.status).toBe(200);
    const institutionIds = new Set(res.body.tickets.map((t: any) => t.institutionId));
    expect(institutionIds.size).toBeGreaterThanOrEqual(1);
  });

  it('une note interne plateforme n’est visible que de l’admin global', async () => {
    const created = await request(app)
      .post('/support/tickets')
      .set(auth(fx.a.student.token))
      .send({ subject: 'Ticket avec note interne', body: 'Bonjour.' });
    const ticketId = created.body.ticket.id;

    const asSchoolInternal = await request(app)
      .post(`/support/tickets/${ticketId}/messages`)
      .set(auth(fx.a.schoolAdmin.token))
      .send({ body: 'Tentative note locale interne', isInternal: true });
    expect(asSchoolInternal.status).toBe(403);

    const internalNote = await request(app)
      .post(`/support/tickets/${ticketId}/messages`)
      .set(auth(fx.globalAdmin.token))
      .send({ body: 'Note SDCREATIV — ne pas partager.', isInternal: true });
    expect(internalNote.status).toBe(201);

    const asStudent = await request(app).get(`/support/tickets/${ticketId}`).set(auth(fx.a.student.token));
    expect(asStudent.body.messages.some((m: any) => m.body.includes('SDCREATIV'))).toBe(false);

    const asSchool = await request(app).get(`/support/tickets/${ticketId}`).set(auth(fx.a.schoolAdmin.token));
    expect(asSchool.body.messages.some((m: any) => m.body.includes('SDCREATIV'))).toBe(false);

    const asPlatform = await request(app).get(`/support/tickets/${ticketId}`).set(auth(fx.globalAdmin.token));
    expect(asPlatform.body.messages.some((m: any) => m.body.includes('SDCREATIV'))).toBe(true);
  });

  it('un demandeur ne peut jamais poser de note interne', async () => {
    const created = await request(app)
      .post('/support/tickets')
      .set(auth(fx.a.student.token))
      .send({ subject: 'Tentative de note interne', body: 'Bonjour.' });

    const res = await request(app)
      .post(`/support/tickets/${created.body.ticket.id}/messages`)
      .set(auth(fx.a.student.token))
      .send({ body: 'Je force une note interne', isInternal: true });
    expect(res.status).toBe(403);
  });

  it('une réponse du demandeur sur un ticket "en attente du client" le relance automatiquement', async () => {
    const created = await request(app)
      .post('/support/tickets')
      .set(auth(fx.a.teacher.token))
      .send({ subject: 'Ticket en attente', body: 'Première demande.' });
    const ticketId = created.body.ticket.id;

    await request(app)
      .patch(`/support/tickets/${ticketId}`)
      .set(auth(fx.a.schoolAdmin.token))
      .send({ status: 'waiting_on_customer' });

    await request(app)
      .post(`/support/tickets/${ticketId}/messages`)
      .set(auth(fx.a.teacher.token))
      .send({ body: 'Voici les informations demandées.' });

    const detail = await request(app).get(`/support/tickets/${ticketId}`).set(auth(fx.a.teacher.token));
    expect(detail.body.ticket.status).toBe('in_progress');
  });

  it('seul le personnel peut modifier priorité/statut ; la clôture horodate closedAt', async () => {
    const created = await request(app)
      .post('/support/tickets')
      .set(auth(fx.a.teacher.token))
      .send({ subject: 'À résoudre', body: 'Détails.' });
    const ticketId = created.body.ticket.id;

    const asTeacher = await request(app)
      .patch(`/support/tickets/${ticketId}`)
      .set(auth(fx.a.teacher.token))
      .send({ status: 'resolved' });
    expect(asTeacher.status).toBe(403);

    const asStaff = await request(app)
      .patch(`/support/tickets/${ticketId}`)
      .set(auth(fx.a.schoolAdmin.token))
      .send({ status: 'resolved' });
    expect(asStaff.status).toBe(200);
    expect(asStaff.body.ticket.closedAt).not.toBeNull();
  });
});
