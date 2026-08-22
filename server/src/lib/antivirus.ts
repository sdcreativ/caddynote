import net from 'node:net';
import { areExternalServicesDisabled } from './testMode.js';

/**
 * DOC-005 : scan antivirus des fichiers déposés par un utilisateur (aucun
 * scan de contenu n'existait jusqu'ici — seul le type déclaré était
 * vérifié). Le fichier transite directement navigateur -> S3 (upload signé,
 * jamais par notre serveur) : le scan a donc lieu *après* l'upload, quand
 * l'appelant confirme le dépôt en rattachant la clé à un dossier réel
 * (`POST /admissions/.../documents`, `PUT /documents/templates/:type`) —
 * c'est le seul moment où le serveur va de toute façon relire l'objet.
 *
 * ClamAV (`clamd`) plutôt qu'un service tiers payant (VirusTotal...) :
 * auto-hébergeable, protocole simple (INSTREAM sur TCP), même principe
 * d'adaptateur réversible que Stripe/CinetPay/SMTP/S3 ailleurs dans l'API —
 * gated par `CLAMAV_HOST`/`CLAMAV_PORT`, dégradation explicite si absent
 * (jamais un blocage silencieux, jamais un faux sentiment de sécurité).
 */

export const isAntivirusConfigured = (): boolean =>
  !areExternalServicesDisabled() && !!process.env.CLAMAV_HOST;

export interface ScanResult {
  scanned: boolean; // false si clamd n'est pas configuré sur cette instance
  clean: boolean;
  threatName?: string;
}

const CHUNK_SIZE = 64 * 1024;

/** Protocole INSTREAM de clamd : commande `zINSTREAM\0`, puis des blocs
 * [taille 4 octets big-endian][données], terminés par un bloc de taille 0.
 * Implémenté directement sur `net.Socket` plutôt qu'une dépendance
 * supplémentaire — le protocole est court et stable. */
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
      // Bloc de taille 0 : signale la fin du flux à clamd.
      const endMarker = Buffer.alloc(4);
      endMarker.writeUInt32BE(0, 0);
      socket.write(endMarker);
    });

    socket.on('data', (data) => responseChunks.push(data));

    socket.on('end', () => {
      const response = Buffer.concat(responseChunks).toString('utf8').replace(/\0/g, '').trim();
      // Réponses possibles : "stream: OK", "stream: <nom> FOUND", "stream: <erreur> ERROR".
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
