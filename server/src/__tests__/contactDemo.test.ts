import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { prisma } from '../lib/prisma.js';
import { isDemoContactSubject, splitContactName } from '../lib/contactDemo.js';
import { buildContactEmailHtml, sanitizeContactSubject } from '../routes/contact.routes.js';

describe('contactDemo helpers', () => {
  it('détecte les sujets démo / présentation / essai', () => {
    expect(isDemoContactSubject('Demande de démo')).toBe(true);
    expect(isDemoContactSubject('Demande de démonstration')).toBe(true);
    expect(isDemoContactSubject('Demande de présentation')).toBe(true);
    expect(isDemoContactSubject('essai gratuit')).toBe(true);
    expect(isDemoContactSubject('Question facturation')).toBe(false);
  });

  it('découpe le nom contact pour l’admin', () => {
    expect(splitContactName('Marie Kouassi')).toEqual({
      firstName: 'Marie',
      lastName: 'Kouassi',
    });
    expect(splitContactName('Alex')).toEqual({ firstName: 'Alex', lastName: 'Admin' });
  });
});

describe('sanitizeContactSubject', () => {
  it('retire CR/LF et les séparateurs Unicode du sujet', () => {
    expect(sanitizeContactSubject('Bonjour\r\nBcc: evil@example.com')).toBe('Bonjour Bcc: evil@example.com');
    expect(sanitizeContactSubject('Ligne1\nLigne2')).toBe('Ligne1 Ligne2');
    expect(sanitizeContactSubject(`Sujet\u2028injecté`)).toBe('Sujet injecté');
    expect(sanitizeContactSubject('\r\n\r\n')).toBe('');
  });
});

describe('POST /contact — sujet SMTP', () => {
  it('persiste un sujet sans CR/LF', async () => {
    const res = await request(app).post('/contact').send({
      name: 'Parent Test',
      email: 'parent-crlf@example.com',
      subject: 'Demande\r\nBcc: attacker@evil.test',
      message: 'Bonjour, je souhaite des informations sur CaddyNote.',
    });
    expect(res.status).toBe(201);
    const row = await prisma.strkContactMessage.findUnique({ where: { id: res.body.id } });
    expect(row?.subject).toBe('Demande Bcc: attacker@evil.test');
    expect(row?.subject).not.toMatch(/[\r\n]/);
  });

  it('refuse un sujet réduit à des retours à la ligne', async () => {
    const res = await request(app).post('/contact').send({
      name: 'Parent Test',
      email: 'parent-empty@example.com',
      subject: '\r\n\n',
      message: 'Bonjour, je souhaite des informations sur CaddyNote.',
    });
    expect(res.status).toBe(400);
  });
});

describe('buildContactEmailHtml', () => {
  it('échappe le HTML injecté dans le nom, l’e-mail et le message', () => {
    const html = buildContactEmailHtml({
      name: '<script>alert(1)</script>',
      email: 'a@b.c"><img src=x onerror=alert(1)>',
      message: 'Bonjour\n<img src=x onerror=alert(1)>',
    });
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;img');
    expect(html).toContain('<br/>');
  });
});
