import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { prisma } from '../lib/prisma.js';
import { buildFixture, auth, type Fixture } from './fixtures.js';

/**
 * §5.16 — alignement tickets établissement ↔ ops + contact public → file ops.
 */
describe('Support / contact — recette §5.16', () => {
  let fx: Fixture;
  const contactIds: string[] = [];
  const ticketIds: string[] = [];

  beforeAll(async () => {
    fx = await buildFixture();
  }, 30000);

  afterAll(async () => {
    if (ticketIds.length) {
      await prisma.strkSupportTicketMessage.deleteMany({ where: { ticketId: { in: ticketIds } } });
      await prisma.strkSupportTicket.deleteMany({ where: { id: { in: ticketIds } } });
    }
    if (contactIds.length) {
      await prisma.strkContactMessage.deleteMany({ where: { id: { in: contactIds } } });
    }
  });

  it('P1 — escalade school_admin → priorité high, désassigné, message public', async () => {
    const created = await request(app)
      .post('/support/tickets')
      .set(auth(fx.a.teacher.token))
      .send({ subject: 'Bug bloquant EDT', body: 'Les créneaux disparaissent.', priority: 'normal' });
    expect(created.status).toBe(201);
    ticketIds.push(created.body.ticket.id);

    const escalated = await request(app)
      .post(`/support/tickets/${created.body.ticket.id}/escalate`)
      .set(auth(fx.a.schoolAdmin.token));
    expect(escalated.status).toBe(200);
    expect(escalated.body.ticket.priority).toBe('high');
    expect(escalated.body.ticket.assignedTo).toBeNull();
    expect(escalated.body.ticket.slaDueAt).toBeTruthy();

    const detail = await request(app)
      .get(`/support/tickets/${created.body.ticket.id}`)
      .set(auth(fx.a.teacher.token));
    expect(detail.body.messages.some((m: { body: string }) => m.body.includes('escaladé'))).toBe(true);

    const otherSchool = await request(app)
      .post(`/support/tickets/${created.body.ticket.id}/escalate`)
      .set(auth(fx.b.schoolAdmin.token));
    expect(otherSchool.status).toBe(403);
  });

  it('P1 — school_admin ne peut pas assigner (réservé plateforme)', async () => {
    const created = await request(app)
      .post('/support/tickets')
      .set(auth(fx.a.teacher.token))
      .send({ subject: 'Assignation', body: 'Test.' });
    ticketIds.push(created.body.ticket.id);

    const res = await request(app)
      .patch(`/support/tickets/${created.body.ticket.id}`)
      .set(auth(fx.a.schoolAdmin.token))
      .send({ assignedTo: fx.a.schoolAdmin.id });
    expect(res.status).toBe(403);

    const ok = await request(app)
      .patch(`/support/tickets/${created.body.ticket.id}`)
      .set(auth(fx.globalAdmin.token))
      .send({ assignedTo: fx.globalAdmin.id });
    expect(ok.status).toBe(200);
    expect(ok.body.ticket.assignedTo).toBe(fx.globalAdmin.id);
  });

  it('P1 — filtre unassigned pour l’admin plateforme', async () => {
    const res = await request(app)
      .get('/support/tickets?unassigned=1')
      .set(auth(fx.globalAdmin.token));
    expect(res.status).toBe(200);
    expect(res.body.tickets.every((t: { assignedTo: string | null }) => t.assignedTo === null)).toBe(true);
  });

  it('P2 — contact public entre en file ops puis convertit en ticket', async () => {
    const contact = await request(app).post('/contact').send({
      name: 'Parent Prospect',
      email: `prospect.${Date.now()}@example.test`,
      subject: 'Demande démo',
      message: 'Bonjour, nous souhaitons une démonstration CaddyNote pour notre collège.',
    });
    expect(contact.status).toBe(201);
    expect(contact.body.id).toBeTruthy();
    contactIds.push(contact.body.id);

    const inbox = await request(app)
      .get('/admin/contact-messages?status=new')
      .set(auth(fx.globalAdmin.token));
    expect(inbox.status).toBe(200);
    expect(inbox.body.messages.some((m: { id: string }) => m.id === contact.body.id)).toBe(true);

    const converted = await request(app)
      .post(`/admin/contact-messages/${contact.body.id}/convert`)
      .set(auth(fx.globalAdmin.token));
    expect(converted.status).toBe(201);
    expect(converted.body.ticket.subject).toContain('[Contact]');
    ticketIds.push(converted.body.ticket.id);

    const again = await request(app)
      .post(`/admin/contact-messages/${contact.body.id}/convert`)
      .set(auth(fx.globalAdmin.token));
    expect(again.status).toBe(200);
    expect(again.body.alreadyConverted).toBe(true);

    const closed = await request(app)
      .patch(`/admin/contact-messages/${contact.body.id}`)
      .set(auth(fx.globalAdmin.token))
      .send({ status: 'closed' });
    // déjà converted — on accepte closed
    expect(closed.status).toBe(200);
    expect(closed.body.message.status).toBe('closed');
  });

  it('P2 — school_admin ne lit pas la file contact ops', async () => {
    const res = await request(app)
      .get('/admin/contact-messages')
      .set(auth(fx.a.schoolAdmin.token));
    expect(res.status).toBe(403);
  });
});
