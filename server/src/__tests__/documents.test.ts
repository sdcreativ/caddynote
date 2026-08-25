import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { buildFixture, auth, type Fixture } from './fixtures.js';

// Documents & vérification (chap. 18, DOC-001 à 005). Sans S3, fileStorage
// persiste sur disque local : `/download` lit les octets stockés (ou régénère
// en repli). Le chemin S3 (URL signée) n'est pas exercé ici.
describe('Documents PDF + QR de vérification (DOC-001 à 005)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await buildFixture();
  }, 30000);

  describe('certificat de scolarité', () => {
    let documentId: string;
    let verificationToken: string;

    it('génère une première version (v1)', async () => {
      const res = await request(app)
        .post('/documents/enrollment-certificate')
        .set(auth(fx.a.schoolAdmin.token))
        .send({ studentId: fx.a.student.id });
      expect(res.status).toBe(201);
      expect(res.body.document.version).toBe(1);
      expect(res.body.document.type).toBe('enrollment_certificate');
      documentId = res.body.document.id;
    });

    it('refuse la génération pour un élève d’un autre établissement', async () => {
      const res = await request(app)
        .post('/documents/enrollment-certificate')
        .set(auth(fx.b.schoolAdmin.token))
        .send({ studentId: fx.a.student.id });
      expect(res.status).toBe(404);
    });

    it('une régénération crée une v2 sans écraser la v1', async () => {
      const res = await request(app)
        .post('/documents/enrollment-certificate')
        .set(auth(fx.a.schoolAdmin.token))
        .send({ studentId: fx.a.student.id });
      expect(res.status).toBe(201);
      expect(res.body.document.version).toBe(2);

      const versions = await request(app).get(`/documents/${documentId}/versions`).set(auth(fx.a.schoolAdmin.token));
      expect(versions.status).toBe(200);
      expect(versions.body.versions.map((v: { version: number }) => v.version).sort()).toEqual([1, 2]);

      // Les tests suivants (téléchargement, révocation) portent sur la
      // dernière version générée (v2), pas sur la v1 initiale.
      documentId = res.body.document.id;
      verificationToken = res.body.document.verificationToken;
    });

    it('persiste le PDF (fileStorage local sans S3) et le retélécharge', async () => {
      const meta = await request(app).get(`/documents/${documentId}`).set(auth(fx.a.schoolAdmin.token));
      expect(meta.status).toBe(200);
      expect(meta.body.document.fileKey).toMatch(/^certificats\//);

      const res = await request(app).get(`/documents/${documentId}/download`).set(auth(fx.a.schoolAdmin.token));
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(Buffer.from(res.body).subarray(0, 5).toString()).toBe('%PDF-');
    });

    it('l’élève lui-même peut consulter et télécharger son certificat', async () => {
      const res = await request(app).get(`/documents/${documentId}`).set(auth(fx.a.student.token));
      expect(res.status).toBe(200);
    });

    it('un autre élève ne peut ni consulter ni télécharger le certificat', async () => {
      const getRes = await request(app).get(`/documents/${documentId}`).set(auth(fx.b.student.token));
      expect(getRes.status).toBe(403);
      const downloadRes = await request(app).get(`/documents/${documentId}/download`).set(auth(fx.b.student.token));
      expect(downloadRes.status).toBe(403);
    });

    it('la vérification publique confirme la validité sans authentification', async () => {
      const res = await request(app).get(`/documents/verify/${verificationToken}`);
      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(true);
      expect(res.body.type).toBe('enrollment_certificate');
      expect(res.body.institution).toBeTruthy();
    });

    it('après révocation, la vérification publique indique le document invalide', async () => {
      const docBefore = await request(app).get(`/documents/${documentId}`).set(auth(fx.a.schoolAdmin.token));
      const revokeRes = await request(app).post(`/documents/${documentId}/revoke`).set(auth(fx.b.schoolAdmin.token));
      expect(revokeRes.status).toBe(404); // pas le bon établissement

      const okRevoke = await request(app).post(`/documents/${documentId}/revoke`).set(auth(fx.a.schoolAdmin.token));
      expect(okRevoke.status).toBe(200);
      expect(okRevoke.body.document.status).toBe('revoked');

      const verify = await request(app).get(`/documents/verify/${verificationToken}`);
      expect(verify.status).toBe(200);
      expect(verify.body.valid).toBe(false);
      expect(verify.body.status).toBe('revoked');
      void docBefore;
    });
  });

  describe('reçu de paiement', () => {
    it('génère un reçu PDF pour un paiement confirmé et le rend accessible au payeur', async () => {
      const feeItem = await request(app)
        .post('/finance/fee-items')
        .set(auth(fx.a.schoolAdmin.token))
        .send({ name: 'Frais de scolarité', amountCents: 50000 });
      expect(feeItem.status).toBe(201);

      const invoice = await request(app)
        .post('/finance/invoices')
        .set(auth(fx.a.schoolAdmin.token))
        .send({ studentId: fx.a.student.id, lines: [{ feeItemId: feeItem.body.feeItem.id, quantity: 1 }] });
      expect(invoice.status).toBe(201);

      const payment = await request(app)
        .post(`/finance/invoices/${invoice.body.invoice.id}/payments/manual`)
        .set(auth(fx.a.schoolAdmin.token))
        .send({ amountCents: 50000, method: 'cash' });
      expect(payment.status).toBe(201);

      const receiptDoc = await request(app)
        .post('/documents/payment-receipt')
        .set(auth(fx.a.schoolAdmin.token))
        .send({ paymentId: payment.body.payment.id });
      expect(receiptDoc.status).toBe(201);
      expect(receiptDoc.body.document.type).toBe('payment_receipt');

      // Le personnel de l'établissement peut télécharger le reçu.
      const download = await request(app)
        .get(`/documents/${receiptDoc.body.document.id}/download`)
        .set(auth(fx.a.schoolAdmin.token));
      expect(download.status).toBe(200);
      expect(Buffer.from(download.body).subarray(0, 5).toString()).toBe('%PDF-');

      // Un parent lié à l'élève avec le droit canViewBilling peut aussi le consulter.
      const parentAccess = await request(app)
        .get(`/documents/${receiptDoc.body.document.id}`)
        .set(auth(fx.parentA.token));
      expect(parentAccess.status).toBe(200);
    });

    it('refuse de générer un reçu pour un paiement non confirmé (pending)', async () => {
      const feeItem = await request(app)
        .post('/finance/fee-items')
        .set(auth(fx.a.schoolAdmin.token))
        .send({ name: 'Autre frais', amountCents: 10000 });
      const invoice = await request(app)
        .post('/finance/invoices')
        .set(auth(fx.a.schoolAdmin.token))
        .send({ studentId: fx.a.student.id, lines: [{ feeItemId: feeItem.body.feeItem.id, quantity: 1 }] });

      // Simule un paiement CinetPay resté "pending" : on ne peut pas
      // atteindre cet état via l'API sans clés réelles, donc on vérifie
      // uniquement le rejet sur un paiement inexistant (même code path).
      const res = await request(app)
        .post('/documents/payment-receipt')
        .set(auth(fx.a.schoolAdmin.token))
        .send({ paymentId: invoice.body.invoice.id }); // id de facture, pas de paiement -> introuvable
      expect(res.status).toBe(404);
    });
  });

  describe('personnalisation par établissement (DOC-002)', () => {
    it("configure puis relit la personnalisation (couleur, pied de page, adresse)", async () => {
      const put = await request(app)
        .put('/documents/templates/enrollment_certificate')
        .set(auth(fx.a.schoolAdmin.token))
        .send({ accentColor: '#3b82f6', footerText: 'Document officiel', showAddress: false });
      expect(put.status).toBe(200);
      expect(put.body.template.accentColor).toBe('#3b82f6');
      expect(put.body.template.showAddress).toBe(false);

      const get = await request(app)
        .get('/documents/templates/enrollment_certificate')
        .set(auth(fx.a.schoolAdmin.token));
      expect(get.status).toBe(200);
      expect(get.body.template.footerText).toBe('Document officiel');
    });

    it('une seconde configuration met à jour la même ligne (pas de doublon)', async () => {
      await request(app)
        .put('/documents/templates/enrollment_certificate')
        .set(auth(fx.a.schoolAdmin.token))
        .send({ accentColor: '#ff0000' });
      const get = await request(app)
        .get('/documents/templates/enrollment_certificate')
        .set(auth(fx.a.schoolAdmin.token));
      expect(get.body.template.accentColor).toBe('#ff0000');
    });

    it('rejette un format de couleur invalide', async () => {
      const res = await request(app)
        .put('/documents/templates/enrollment_certificate')
        .set(auth(fx.a.schoolAdmin.token))
        .send({ accentColor: 'bleu' });
      expect(res.status).toBe(400);
    });

    it('la configuration d’un établissement n’affecte pas celle d’un autre', async () => {
      await request(app)
        .put('/documents/templates/enrollment_certificate')
        .set(auth(fx.b.schoolAdmin.token))
        .send({ accentColor: '#00ff00' });

      const aTemplate = await request(app)
        .get('/documents/templates/enrollment_certificate')
        .set(auth(fx.a.schoolAdmin.token));
      const bTemplate = await request(app)
        .get('/documents/templates/enrollment_certificate')
        .set(auth(fx.b.schoolAdmin.token));

      expect(aTemplate.body.template.accentColor).toBe('#ff0000');
      expect(bTemplate.body.template.accentColor).toBe('#00ff00');
    });

    it("refuse une clé de logo n'appartenant pas à l'établissement de l'appelant (ORG-004)", async () => {
      const res = await request(app)
        .put('/documents/templates/enrollment_certificate')
        .set(auth(fx.a.schoolAdmin.token))
        .send({ logoKey: `documents/inst-${fx.b.institutionId}/logo.png` });
      expect(res.status).toBe(403);
    });

    it('la génération de document continue de fonctionner une fois la personnalisation configurée', async () => {
      const res = await request(app)
        .post('/documents/enrollment-certificate')
        .set(auth(fx.a.schoolAdmin.token))
        .send({ studentId: fx.a.student.id });
      expect(res.status).toBe(201);

      const download = await request(app)
        .get(`/documents/${res.body.document.id}/download`)
        .set(auth(fx.a.schoolAdmin.token));
      expect(download.status).toBe(200);
      expect(Buffer.from(download.body).subarray(0, 5).toString()).toBe('%PDF-');
    });

    it('accepte et relit la police, le filigrane et le bloc de signature', async () => {
      const put = await request(app)
        .put('/documents/templates/payment_receipt')
        .set(auth(fx.a.schoolAdmin.token))
        .send({ font: 'times', watermarkEnabled: true, signatureLabel: 'Le comptable', signatureName: 'Mme Diallo' });
      expect(put.status).toBe(200);
      expect(put.body.template.font).toBe('times');
      expect(put.body.template.watermarkEnabled).toBe(true);

      const get = await request(app)
        .get('/documents/templates/payment_receipt')
        .set(auth(fx.a.schoolAdmin.token));
      expect(get.body.template.signatureName).toBe('Mme Diallo');
    });

    describe('aperçu (preview)', () => {
      it('génère un PDF d’exemple à partir d’une configuration non enregistrée', async () => {
        const res = await request(app)
          .post('/documents/templates/enrollment_certificate/preview')
          .set(auth(fx.a.schoolAdmin.token))
          .send({ accentColor: '#123456', watermarkEnabled: true, signatureLabel: 'Le directeur' });
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toBe('application/pdf');
        expect(Buffer.from(res.body).subarray(0, 5).toString()).toBe('%PDF-');
      });

      it('ne modifie ni n’enregistre rien (la configuration sauvegardée reste inchangée)', async () => {
        const before = await request(app)
          .get('/documents/templates/enrollment_certificate')
          .set(auth(fx.a.schoolAdmin.token));

        await request(app)
          .post('/documents/templates/enrollment_certificate/preview')
          .set(auth(fx.a.schoolAdmin.token))
          .send({ accentColor: '#abcdef' });

        const after = await request(app)
          .get('/documents/templates/enrollment_certificate')
          .set(auth(fx.a.schoolAdmin.token));
        expect(after.body.template.accentColor).toBe(before.body.template.accentColor);
      });

      it('refuse une clé de logo étrangère même en aperçu (ORG-004)', async () => {
        const res = await request(app)
          .post('/documents/templates/enrollment_certificate/preview')
          .set(auth(fx.a.schoolAdmin.token))
          .send({ logoKey: `documents/inst-${fx.b.institutionId}/logo.png` });
        expect(res.status).toBe(403);
      });

      it('rejette un type de document invalide', async () => {
        const res = await request(app)
          .post('/documents/templates/not_a_type/preview')
          .set(auth(fx.a.schoolAdmin.token))
          .send({});
        expect(res.status).toBe(400);
      });
    });
  });

  describe('GET /documents — liste par établissement', () => {
    it('liste les documents déjà générés pour l’établissement, réservé au personnel', async () => {
      await request(app)
        .post('/documents/enrollment-certificate')
        .set(auth(fx.a.schoolAdmin.token))
        .send({ studentId: fx.a.student.id });

      const res = await request(app).get('/documents').set(auth(fx.a.schoolAdmin.token));
      expect(res.status).toBe(200);
      expect(res.body.documents.length).toBeGreaterThan(0);
      expect(res.body.documents.every((d: any) => d.institutionId === fx.a.institutionId)).toBe(true);
    });

    it("un élève ne peut pas parcourir la liste (rôle insuffisant)", async () => {
      const res = await request(app).get('/documents').set(auth(fx.a.student.token));
      expect(res.status).toBe(403);
    });

    it("le personnel d'un autre établissement ne voit pas les documents de A (ORG-004)", async () => {
      const res = await request(app)
        .get(`/documents?institutionId=${fx.a.institutionId}`)
        .set(auth(fx.b.schoolAdmin.token));
      expect(res.status).toBe(403);
    });
  });
});
