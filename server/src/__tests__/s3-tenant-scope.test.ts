import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { buildTenantScope, buildObjectKey, isOwnedObjectKey } from '../lib/s3.js';
import { registerActor, auth } from './fixtures.js';

// ORG-004 / DOC-005 — le stockage de fichiers (S3/MinIO/R2) n'est pas
// configuré dans cet environnement de test (pas de clés réelles), donc les
// routes /files/* répondent 501 avant même d'atteindre la vérification de
// périmètre. On teste ici directement la logique pure qui rattache une clé
// d'objet à un tenant, seul endroit où l'isolation fichiers se joue.
describe('Isolation multi-tenant — clés d’objets S3', () => {
  it('rattache une clé au périmètre établissement quand il y en a un', () => {
    expect(buildTenantScope('inst-a', 'user-1')).toBe('inst-inst-a');
  });

  it('rattache une clé au périmètre compte quand il n’y a pas d’établissement (parent/admin global)', () => {
    expect(buildTenantScope(null, 'user-1')).toBe('user-user-1');
    expect(buildTenantScope(undefined, 'user-1')).toBe('user-user-1');
  });

  it('une clé générée pour l’établissement A n’est pas reconnue comme appartenant à B', () => {
    const key = buildObjectKey('documents', buildTenantScope('inst-a', 'staff-a'), 'bulletin.pdf');
    expect(isOwnedObjectKey(key, 'documents', 'inst-a', 'staff-a')).toBe(true);
    expect(isOwnedObjectKey(key, 'documents', 'inst-b', 'staff-b')).toBe(false);
  });

  it('une clé générée pour un compte sans établissement n’est pas accessible à un autre compte', () => {
    const key = buildObjectKey('avatars', buildTenantScope(null, 'parent-1'), 'photo.jpg');
    expect(isOwnedObjectKey(key, 'avatars', null, 'parent-1')).toBe(true);
    expect(isOwnedObjectKey(key, 'avatars', null, 'parent-2')).toBe(false);
    // Un établissement ne doit pas non plus pouvoir se faire passer pour ce compte.
    expect(isOwnedObjectKey(key, 'avatars', 'inst-a', 'staff-a')).toBe(false);
  });

  it('une clé d’un autre dossier n’est jamais considérée comme possédée', () => {
    const key = buildObjectKey('documents', buildTenantScope('inst-a', 'staff-a'), 'contrat.pdf');
    expect(isOwnedObjectKey(key, 'avatars', 'inst-a', 'staff-a')).toBe(false);
  });

  // Aucune clé S3_* n'est configurée dans cet environnement de test : les
  // routes doivent répondre 501 de façon explicite (même principe que
  // Stripe/CinetPay/SMTP ailleurs dans l'API), jamais planter ni se comporter
  // comme si le stockage était disponible.
  it('les routes /files répondent en mode local tant que S3 n’est pas configuré', async () => {
    const actor = await registerActor('teacher');
    const upload = await request(app)
      .post('/files/presign-upload')
      .set(auth(actor.token))
      .send({ folder: 'documents', filename: 'test.pdf', contentType: 'application/pdf' });
    expect(upload.status).toBe(200);
    expect(upload.body.mode).toBe('local');
    expect(upload.body.key).toMatch(/^documents\//);
    expect(upload.body.uploadPath).toBe('/files/direct-upload');

    const download = await request(app)
      .post('/files/presign-download')
      .set(auth(actor.token))
      .send({ key: 'documents/inst-x/test.pdf' });
    // Téléchargement signé reste réservé à S3.
    expect(download.status).toBe(501);
  });

  it('accepte un upload direct local de justificatif puis un dépôt parent', async () => {
    const { buildFixture, auth: authHeader } = await import('./fixtures.js');
    const fx = await buildFixture();
    const absenceRes = await request(app).post('/absences').set(authHeader(fx.a.teacher.token)).send({
      studentId: fx.a.student.id,
      institutionId: fx.a.institutionId,
      type: 'absence',
      date: '2026-08-25',
      duration: 60,
    });
    expect(absenceRes.status).toBe(201);

    const presign = await request(app)
      .post('/files/presign-upload')
      .set(authHeader(fx.parentA.token))
      .send({ folder: 'justificatifs', filename: 'cert.pdf', contentType: 'application/pdf' });
    expect(presign.status).toBe(200);
    expect(presign.body.mode).toBe('local');

    const put = await request(app)
      .put('/files/direct-upload')
      .set(authHeader(fx.parentA.token))
      .set('Content-Type', 'application/pdf')
      .set('X-Object-Key', presign.body.key)
      .send(Buffer.from('%PDF-1.4 fake'));
    expect(put.status).toBe(201);

    const absenceId = absenceRes.body.absence.id as string;
    const justify = await request(app)
      .patch(`/absences/${absenceId}/justify`)
      .set(authHeader(fx.parentA.token))
      .send({
        justification: 'Rendez-vous médical',
        justificationFile: put.body.key,
      });
    expect(justify.status).toBe(200);
    expect(justify.body.absence.justificationStatus).toBe('pending');
    expect(justify.body.absence.justificationFile).toBe(put.body.key);

    // Parent et direction ouvrent via l’absence (pas /files/presign-download) :
    // la clé est sous user-{parentId}, hors périmètre inst-{école} du staff.
    const parentMeta = await request(app)
      .get(`/absences/${absenceId}/justification-file`)
      .set(authHeader(fx.parentA.token));
    expect(parentMeta.status).toBe(200);
    expect(parentMeta.body.mode).toBe('local');
    expect(parentMeta.body.downloadPath).toBe(`/absences/${absenceId}/justification-file/content`);

    const parentBytes = await request(app)
      .get(`/absences/${absenceId}/justification-file/content`)
      .set(authHeader(fx.parentA.token));
    expect(parentBytes.status).toBe(200);
    expect(parentBytes.headers['content-type']).toMatch(/pdf/);
    expect(Buffer.compare(parentBytes.body as Buffer, Buffer.from('%PDF-1.4 fake'))).toBe(0);

    const staffMeta = await request(app)
      .get(`/absences/${absenceId}/justification-file`)
      .set(authHeader(fx.a.schoolAdmin.token));
    expect(staffMeta.status).toBe(200);
    expect(staffMeta.body.downloadPath).toBe(`/absences/${absenceId}/justification-file/content`);

    const staffBytes = await request(app)
      .get(`/absences/${absenceId}/justification-file/content`)
      .set(authHeader(fx.a.schoolAdmin.token));
    expect(staffBytes.status).toBe(200);

    const otherTenant = await request(app)
      .get(`/absences/${absenceId}/justification-file`)
      .set(authHeader(fx.b.schoolAdmin.token));
    expect(otherTenant.status).toBe(403);
  });

  // DOC-005 : le type MIME est vérifié avant même la disponibilité de S3
  // (contrairement à /presign-download, resté gated en premier) — une
  // requête mal formée doit être rejetée pour ce qu'elle est (400), pas
  // masquée derrière un 501 qui laisserait croire que tout irait bien une
  // fois S3 configuré. C'est ce qui rend ce test possible sans bucket réel.
  describe('DOC-005 — restriction MIME/taille par dossier', () => {
    it('rejette un type non autorisé pour le dossier visé, avant même la vérification S3', async () => {
      const actor = await registerActor('teacher');
      const res = await request(app)
        .post('/files/presign-upload')
        .set(auth(actor.token))
        .send({ folder: 'avatars', filename: 'malware.exe', contentType: 'application/x-msdownload' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('non autorisé');
    });

    it('un PDF est refusé pour le dossier avatars (images uniquement) mais accepté pour documents', async () => {
      const actor = await registerActor('teacher');
      const forAvatars = await request(app)
        .post('/files/presign-upload')
        .set(auth(actor.token))
        .send({ folder: 'avatars', filename: 'cv.pdf', contentType: 'application/pdf' });
      expect(forAvatars.status).toBe(400);

      // Type autorisé pour ce dossier -> passe la validation ; sans S3,
      // l’API propose désormais le mode local (plus de 501 à ce stade).
      const forDocuments = await request(app)
        .post('/files/presign-upload')
        .set(auth(actor.token))
        .send({ folder: 'documents', filename: 'cv.pdf', contentType: 'application/pdf' });
      expect(forDocuments.status).toBe(200);
      expect(forDocuments.body.mode).toBe('local');

      const forMaterials = await request(app)
        .post('/files/presign-upload')
        .set(auth(actor.token))
        .send({ folder: 'cours', filename: 'cours.pdf', contentType: 'application/pdf' });
      expect(forMaterials.status).toBe(200);
      expect(forMaterials.body.mode).toBe('local');
    });
  });
});
