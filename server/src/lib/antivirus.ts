import net from 'node:net';
import { areExternalServicesDisabled } from './testMode.js';
import { getDeployment, isHardenedRuntime } from './deployment.js';

/**
 * DOC-005 : scan antivirus ClamAV (clamd INSTREAM).
 * Production : obligatoire (fail-closed). Staging/local : optionnel (Oracle ARM).
 */

export const isAntivirusConfigured = (): boolean =>
  !areExternalServicesDisabled() && !!process.env.CLAMAV_HOST?.trim();

/** Obligatoire uniquement en production hors test mode. */
export const isAntivirusRequired = (): boolean =>
  getDeployment() === 'production' && isHardenedRuntime();

export interface ScanResult {
  scanned: boolean;
  clean: boolean;
  threatName?: string;
}

export class AntivirusGateError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = 'AntivirusGateError';
    this.status = status;
    this.code = code;
  }
}

/** Fail-fast au boot API en production sans ClamAV. */
export const assertAntivirusReady = (): void => {
  if (!isAntivirusRequired()) return;
  if (!isAntivirusConfigured()) {
    throw new Error(
      'CLAMAV_HOST obligatoire en production (service clamav / profil antivirus). ' +
        'Refus de démarrer sans scan antivirus des uploads.'
    );
  }
};

/**
 * Refuse un upload non sain. En production : config + scan obligatoires.
 * En staging : scan si ClamAV présent ; sinon no-op.
 */
export const assertCleanUpload = async (buffer: Buffer): Promise<void> => {
  if (!isAntivirusConfigured()) {
    if (isAntivirusRequired()) {
      throw new AntivirusGateError(
        'Antivirus non configuré — dépôt de fichiers indisponible.',
        503,
        'antivirus_required'
      );
    }
    return;
  }

  let scan: ScanResult;
  try {
    scan = await scanBuffer(buffer);
  } catch (error) {
    console.error('Échec du scan antivirus (clamd) :', error);
    if (isAntivirusRequired()) {
      throw new AntivirusGateError(
        'Service antivirus indisponible — réessayez plus tard.',
        503,
        'antivirus_unavailable'
      );
    }
    return;
  }

  if (scan.scanned && !scan.clean) {
    throw new AntivirusGateError(
      'Fichier refusé par l’antivirus',
      422,
      'malware_detected'
    );
  }
};

const CHUNK_SIZE = 64 * 1024;

export const scanBuffer = (buffer: Buffer): Promise<ScanResult> => {
  if (!isAntivirusConfigured()) {
    return Promise.resolve({ scanned: false, clean: true });
  }

  return new Promise((resolve, reject) => {
    const host = process.env.CLAMAV_HOST!;
    const port = Number(process.env.CLAMAV_PORT) || 3310;
    const socket = net.createConnection({ host, port });
    const responseChunks: Buffer[] = [];
    let settled = false;

    const finish = (result: ScanResult | Error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (result instanceof Error) reject(result);
      else resolve(result);
    };

    socket.setTimeout(10_000, () => finish(new Error('Délai dépassé pour le scan antivirus (clamd)')));
    socket.on('error', (error) => finish(error));

    socket.on('connect', () => {
      socket.write('zINSTREAM\0');
      for (let offset = 0; offset < buffer.length; offset += CHUNK_SIZE) {
        const chunk = buffer.subarray(offset, offset + CHUNK_SIZE);
        const sizeHeader = Buffer.alloc(4);
        sizeHeader.writeUInt32BE(chunk.length, 0);
        socket.write(sizeHeader);
        socket.write(chunk);
      }
      const endMarker = Buffer.alloc(4);
      endMarker.writeUInt32BE(0, 0);
      socket.write(endMarker);
    });

    socket.on('data', (data) => responseChunks.push(data));

    socket.on('end', () => {
      const response = Buffer.concat(responseChunks).toString('utf8').replace(/\0/g, '').trim();
      if (response.includes('FOUND')) {
        const threatName = response.replace('stream:', '').replace('FOUND', '').trim();
        return finish({ scanned: true, clean: false, threatName });
      }
      if (response.includes('OK')) {
        return finish({ scanned: true, clean: true });
      }
      finish(new Error(`Réponse clamd inattendue : ${response}`));
    });
  });
};
