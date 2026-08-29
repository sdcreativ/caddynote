import { describe, it, expect, afterEach } from 'vitest';
import net from 'node:net';
import {
  isAntivirusConfigured,
  isAntivirusRequired,
  scanBuffer,
  assertCleanUpload,
  assertAntivirusReady,
  AntivirusGateError,
} from '../lib/antivirus.js';

describe('Antivirus — clamd (DOC-005)', () => {
  const originalHost = process.env.CLAMAV_HOST;
  const originalPort = process.env.CLAMAV_PORT;
  const originalDeploy = process.env.CADDYNOTE_DEPLOYMENT;
  const originalTest = process.env.CADDYNOTE_TEST_MODE;

  afterEach(() => {
    if (originalHost === undefined) delete process.env.CLAMAV_HOST;
    else process.env.CLAMAV_HOST = originalHost;
    if (originalPort === undefined) delete process.env.CLAMAV_PORT;
    else process.env.CLAMAV_PORT = originalPort;
    if (originalDeploy === undefined) delete process.env.CADDYNOTE_DEPLOYMENT;
    else process.env.CADDYNOTE_DEPLOYMENT = originalDeploy;
    if (originalTest === undefined) delete process.env.CADDYNOTE_TEST_MODE;
    else process.env.CADDYNOTE_TEST_MODE = originalTest;
  });

  it("n'est pas configuré par défaut, et le scan se dégrade explicitement", async () => {
    delete process.env.CLAMAV_HOST;
    delete process.env.CADDYNOTE_DEPLOYMENT;
    expect(isAntivirusConfigured()).toBe(false);
    expect(isAntivirusRequired()).toBe(false);
    const result = await scanBuffer(Buffer.from('contenu quelconque'));
    expect(result.scanned).toBe(false);
    expect(result.clean).toBe(true);
    await expect(assertCleanUpload(Buffer.from('ok'))).resolves.toBeUndefined();
  });

  it('exige ClamAV en production', () => {
    delete process.env.CLAMAV_HOST;
    process.env.CADDYNOTE_DEPLOYMENT = 'production';
    process.env.CADDYNOTE_TEST_MODE = 'false';
    expect(isAntivirusRequired()).toBe(true);
    expect(() => assertAntivirusReady()).toThrow(/CLAMAV_HOST/);
  });

  it('assertCleanUpload refuse en production sans ClamAV', async () => {
    delete process.env.CLAMAV_HOST;
    process.env.CADDYNOTE_DEPLOYMENT = 'production';
    process.env.CADDYNOTE_TEST_MODE = 'false';
    await expect(assertCleanUpload(Buffer.from('x'))).rejects.toMatchObject({
      name: 'AntivirusGateError',
      code: 'antivirus_required',
      status: 503,
    });
  });

  it('assertCleanUpload refuse en production si clamd est down', async () => {
    process.env.CADDYNOTE_DEPLOYMENT = 'production';
    process.env.CADDYNOTE_TEST_MODE = 'false';
    process.env.CLAMAV_HOST = '127.0.0.1';
    process.env.CLAMAV_PORT = '1'; // port fermé
    await expect(assertCleanUpload(Buffer.from('x'))).rejects.toMatchObject({
      name: 'AntivirusGateError',
      code: 'antivirus_unavailable',
      status: 503,
    });
  });

  it('staging sans ClamAV laisse passer (optionnel)', async () => {
    delete process.env.CLAMAV_HOST;
    process.env.CADDYNOTE_DEPLOYMENT = 'staging';
    process.env.CADDYNOTE_TEST_MODE = 'false';
    expect(isAntivirusRequired()).toBe(false);
    await expect(assertCleanUpload(Buffer.from('ok'))).resolves.toBeUndefined();
  });

  const withFakeClamd = (
    respond: (received: Buffer) => string
  ): Promise<{ close: () => Promise<void>; port: number }> =>
    new Promise((resolve) => {
      const server = net.createServer((socket) => {
        const chunks: Buffer[] = [];
        socket.on('data', (data) => {
          chunks.push(data);
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
    await assertCleanUpload(Buffer.from('fichier propre'));

    await fake.close();
  });

  it('reconnaît une réponse infectée et assertCleanUpload lève 422', async () => {
    const fake = await withFakeClamd(() => 'stream: Eicar-Test-Signature FOUND');
    process.env.CLAMAV_HOST = '127.0.0.1';
    process.env.CLAMAV_PORT = String(fake.port);

    const result = await scanBuffer(Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'));
    expect(result.scanned).toBe(true);
    expect(result.clean).toBe(false);
    expect(result.threatName).toContain('Eicar-Test-Signature');

    try {
      await assertCleanUpload(Buffer.from('eicar'));
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(AntivirusGateError);
      expect((e as AntivirusGateError).code).toBe('malware_detected');
      expect((e as AntivirusGateError).status).toBe(422);
    }

    await fake.close();
  });

  it('scanne un fichier assez gros pour tenir sur plusieurs blocs', async () => {
    const fake = await withFakeClamd(() => 'stream: OK');
    process.env.CLAMAV_HOST = '127.0.0.1';
    process.env.CLAMAV_PORT = String(fake.port);

    const bigBuffer = Buffer.alloc(200 * 1024, 'a');
    const result = await scanBuffer(bigBuffer);
    expect(result.scanned).toBe(true);
    expect(result.clean).toBe(true);

    await fake.close();
  });
});
