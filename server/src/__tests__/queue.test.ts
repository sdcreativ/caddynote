import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { prisma } from '../lib/prisma.js';
import { queueCommunication, dispatchCommunicationById } from '../lib/communications.js';
import { registerCommunicationDispatchWorker, stopQueue } from '../lib/queue.js';
import { buildFixture, auth, type Fixture } from './fixtures.js';

/**
 * Découplage envoi/traitement (Lot 6) — `pg-boss` (Postgres, pas de Redis
 * ajouté à l'infrastructure) plutôt qu'une exécution différée non durable.
 * `push` sert de "véhicule" pour tester la mécanique de file réelle (mise
 * en file, worker, mise à jour finale du statut) sans dépendre d'un compte
 * SMTP/Twilio réel — le canal choisi n'a aucune importance pour la file
 * elle-même, seul `dispatchCommunicationById` sait quoi faire de chaque
 * canal. La route HTTP, elle, garde `push` synchrone (voir
 * communications.routes.ts) : ce test vérifie la brique `lib/queue.ts`
 * indépendamment de ce choix de routage.
 */
describe('File d’attente de communications (découplage envoi/traitement)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await buildFixture();
    await registerCommunicationDispatchWorker(dispatchCommunicationById);
  }, 30000);

  afterAll(async () => {
    await stopQueue();
  });

  const waitForStatus = async (logId: string, status: string, timeoutMs = 10000): Promise<any> => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const log = await prisma.strkCommunicationLog.findUnique({ where: { id: logId } });
      if (log?.status === status) return log;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error(`Le journal ${logId} n'a jamais atteint le statut "${status}" (timeout ${timeoutMs}ms)`);
  };

  it('queueCommunication() met en file sans envoyer immédiatement, le worker traite ensuite réellement le job', async () => {
    const before = await prisma.notification.count({ where: { userId: fx.a.student.id } });

    const result = await queueCommunication({
      recipientId: fx.a.student.id,
      channel: 'push',
      subject: 'File réelle',
      body: 'Ce message passe par pg-boss',
      requestedBy: fx.a.teacher.id,
      institutionId: fx.a.institutionId,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Rien envoyé pendant l'appel lui-même : encore "queued", pas de
    // notification créée tant que le worker n'est pas passé.
    expect(result.log.status).toBe('queued');
    const immediatelyAfter = await prisma.notification.count({ where: { userId: fx.a.student.id } });
    expect(immediatelyAfter).toBe(before);

    // Le worker (déjà enregistré dans beforeAll) traite le job de façon
    // authentiquement asynchrone — on attend la mise à jour réelle.
    const finalLog = await waitForStatus(result.log.id, 'delivered');
    expect(finalLog.deliveredAt).not.toBeNull();

    const afterWorker = await prisma.notification.count({ where: { userId: fx.a.student.id } });
    expect(afterWorker).toBe(before + 1);
  }, 15000);

  it('dispatchCommunicationById() est idempotent : un journal déjà traité n’est jamais renvoyé une seconde fois', async () => {
    const result = await queueCommunication({
      recipientId: fx.a.student.id,
      channel: 'push',
      subject: 'Idempotence',
      body: 'Une seule fois',
      requestedBy: fx.a.teacher.id,
      institutionId: fx.a.institutionId,
    });
    if (!result.ok) throw new Error('échec inattendu');
    await waitForStatus(result.log.id, 'delivered');

    const countBefore = await prisma.notification.count({ where: { userId: fx.a.student.id, message: 'Une seule fois' } });
    expect(countBefore).toBe(1);

    // Rejoue directement le traitement (simule un retry pg-boss après un
    // crash survenu juste après la mise à jour du statut, avant l'ack).
    await dispatchCommunicationById(result.log.id);

    const countAfter = await prisma.notification.count({ where: { userId: fx.a.student.id, message: 'Une seule fois' } });
    expect(countAfter).toBe(1); // toujours une seule, pas de doublon
  }, 15000);

  it('dispatchCommunicationById() sur un id inexistant ne lève jamais d’exception', async () => {
    await expect(dispatchCommunicationById('00000000-0000-0000-0000-000000000000')).resolves.toBeUndefined();
  });

  describe('POST /communications/send — e-mail/SMS/WhatsApp réellement mis en file par la route HTTP', () => {
    const originalEnv = {
      SMTP_HOST: process.env.SMTP_HOST,
      SMTP_USER: process.env.SMTP_USER,
      SMTP_PASS: process.env.SMTP_PASS,
      SMTP_FROM: process.env.SMTP_FROM,
    };

    afterEach(() => {
      for (const [key, value] of Object.entries(originalEnv)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    });

    it("répond 202 immédiatement (statut encore 'queued'), puis le worker échoue proprement sur un fournisseur injoignable", async () => {
      // SMTP "configuré" (isEmailConfigured() devient vrai) mais pointant
      // vers un port sur lequel rien n'écoute : échec de connexion rapide et
      // authentique, pas un vrai envoi — suffisant pour prouver que la
      // requête HTTP ne l'attend pas.
      process.env.SMTP_HOST = '127.0.0.1';
      process.env.SMTP_USER = 'user';
      process.env.SMTP_PASS = 'pass';
      process.env.SMTP_FROM = 'test@example.com';

      const res = await request(app)
        .post('/communications/send')
        .set(auth(fx.a.teacher.token))
        .send({ recipientId: fx.a.student.id, channel: 'email', subject: 'Test file', body: 'Contenu' });

      expect(res.status).toBe(202);
      expect(res.body.log.status).toBe('queued');

      const finalLog = await waitForStatus(res.body.log.id, 'failed');
      expect(finalLog.errorMessage).toBeTruthy();
    }, 20000);
  });
});
