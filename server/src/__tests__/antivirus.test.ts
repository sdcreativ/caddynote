import { describe, it, expect, afterEach } from 'vitest';
import net from 'node:net';
import { isAntivirusConfigured, scanBuffer } from '../lib/antivirus.js';

/**
 * DOC-005 — scan antivirus (clamd, protocole INSTREAM). Aucun démon clamd
 * réel n'est disponible dans cet environnement de test : un faux serveur
 * TCP qui reproduit le protocole (lit les blocs [taille][données] jusqu'au
 * bloc de taille 0, répond "stream: OK"/"stream: <nom> FOUND") permet de
 * vérifier le client réel sans dépendre d'un binaire externe — même
 * principe que les webhooks Stripe/CinetPay testés avec des requêtes
 * construites à la main plutôt qu'un vrai compte fournisseur.
 */
describe('Antivirus — clamd (DOC-005)', () => {
  const originalHost = process.env.CLAMAV_HOST;
  const originalPort = process.env.CLAMAV_PORT;

  afterEach(() => {
    if (originalHost === undefined) delete process.env.CLAMAV_HOST;
    else process.env.CLAMAV_HOST = originalHost;
    if (originalPort === undefined) delete process.env.CLAMAV_PORT;
    else process.env.CLAMAV_PORT = originalPort;
  });

  it("n'est pas configuré par défaut, et le scan se dégrade explicitement (jamais un blocage silencieux)", async () => {
    delete process.env.CLAMAV_HOST;
    expect(isAntivirusConfigured()).toBe(false);
    const result = await scanBuffer(Buffer.from('contenu quelconque'));
    expect(result.scanned).toBe(false);
    expect(result.clean).toBe(true);
  });

  const withFakeClamd = (
    respond: (received: Buffer) => string
  ): Promise<{ close: () => Promise<void>; port: number }> =>
    new Promise((resolve) => {
      const server = net.createServer((socket) => {
        const chunks: Buffer[] = [];
        socket.on('data', (data) => {
          chunks.push(data);
          // Le flux INSTREAM se termine par un bloc de taille 0 (4 octets à zéro).
          const all = Buffer.concat(chunks);
          if (all.length >= 4 && all.subarray(all.length - 4).equals(Buffer.alloc(4))) {
            socket.end(respond(all) + '\0');
          }
        });
      });
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        const port = typeof address === 'object' && address ? address.port : 0;
        resolve({ port, close: () => new Promise((r) => server.close(() => r())) });
      });
    });

  it('reconnaît une réponse "clean" (stream: OK)', async () => {
    const fake = await withFakeClamd(() => 'stream: OK');
    process.env.CLAMAV_HOST = '127.0.0.1';
    process.env.CLAMAV_PORT = String(fake.port);

    const result = await scanBuffer(Buffer.from('fichier propre'));
    expect(result.scanned).toBe(true);
    expect(result.clean).toBe(true);

    await fake.close();
  });

  it('reconnaît une réponse infectée (stream: <nom> FOUND) et remonte le nom de la menace', async () => {
    const fake = await withFakeClamd(() => 'stream: Eicar-Test-Signature FOUND');
    process.env.CLAMAV_HOST = '127.0.0.1';
    process.env.CLAMAV_PORT = String(fake.port);

    const result = await scanBuffer(Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'));
    expect(result.scanned).toBe(true);
    expect(result.clean).toBe(false);
    expect(result.threatName).toContain('Eicar-Test-Signature');

    await fake.close();
  });

  it('scanne un fichier assez gros pour tenir sur plusieurs blocs', async () => {
    const fake = await withFakeClamd(() => 'stream: OK');
    process.env.CLAMAV_HOST = '127.0.0.1';
    process.env.CLAMAV_PORT = String(fake.port);

    const bigBuffer = Buffer.alloc(200 * 1024, 'a'); // > CHUNK_SIZE (64 Ko)
    const result = await scanBuffer(bigBuffer);
    expect(result.scanned).toBe(true);
    expect(result.clean).toBe(true);

    await fake.close();
  });
});
