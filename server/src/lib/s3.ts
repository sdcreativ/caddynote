import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import crypto from 'node:crypto';
import { areExternalServicesDisabled } from './testMode.js';

/**
 * Stockage fichiers (remplace Supabase Storage — audit §5.2/Lot 0). Client
 * compatible S3 générique via le SDK AWS v3 : fonctionne aussi bien avec AWS
 * S3 qu'avec MinIO/Cloudflare R2/Backblaze B2/DigitalOcean Spaces en ne
 * changeant que les variables d'environnement (S3_ENDPOINT pour tout ce qui
 * n'est pas AWS S3 lui-même).
 *
 * Variables requises : S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY.
 * Optionnelles : S3_REGION (def. "auto"), S3_ENDPOINT (MinIO/R2/...),
 * S3_FORCE_PATH_STYLE=true (requis pour MinIO).
 *
 * DOC-005 (sécurité fichiers) : les objets ne sont jamais rendus publics —
 * tout accès passe par une URL signée à durée de vie limitée, en
 * upload (PUT) comme en téléchargement (GET).
 */

let client: S3Client | null = null;

export const isS3Configured = (): boolean =>
  !areExternalServicesDisabled() &&
  !!(process.env.S3_BUCKET && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY);

const getClient = (): S3Client => {
  if (!client) {
    client = new S3Client({
      region: process.env.S3_REGION || 'auto',
      endpoint: process.env.S3_ENDPOINT || undefined,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID!,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
      },
    });
  }
  return client;
};

const getBucket = (): string => process.env.S3_BUCKET!;

/** Segment de chemin qui rattache une clé d'objet à un tenant (ORG-004) :
 * l'établissement de l'appelant, ou son propre compte pour les rôles sans
 * établissement (parent, admin global). Utilisé à l'upload comme au
 * téléchargement pour qu'un objet ne soit jamais accessible en dehors de
 * son périmètre — la seule imprévisibilité du nom ne suffit pas à faire de
 * l'autorisation (cf. `isOwnedObjectKey` ci-dessous). */
export const buildTenantScope = (institutionId: string | null | undefined, userId: string): string =>
  institutionId ? `inst-${institutionId}` : `user-${userId}`;

/** Génère une clé d'objet imprévisible mais traçable (dossier + périmètre du
 * tenant + horodatage + aléa), pour éviter les collisions, l'énumération de
 * noms de fichiers, et l'accès inter-établissement. */
export const buildObjectKey = (folder: string, tenantScope: string, originalFilename: string): string => {
  const safeName = originalFilename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100);
  const random = crypto.randomBytes(8).toString('hex');
  return `${folder}/${tenantScope}/${Date.now()}-${random}-${safeName}`;
};

/** Vérifie qu'une clé d'objet appartient bien au périmètre tenant de
 * l'appelant (même établissement, ou même compte pour les rôles sans
 * établissement) — appelé avant toute délivrance d'URL signée de
 * téléchargement (DOC-005 / ORG-004). */
export const isOwnedObjectKey = (
  key: string,
  folder: string,
  institutionId: string | null | undefined,
  userId: string
): boolean => key.startsWith(`${folder}/${buildTenantScope(institutionId, userId)}/`);

/**
 * DOC-005 : upload direct navigateur -> S3 signé, avec taille et type MIME
 * réellement imposés par S3 lui-même (pas seulement vérifiés côté API avant
 * signature) — une URL PUT signée simple ne peut pas porter ce genre de
 * contrainte ; un POST signé avec conditions de policy, si. Le navigateur
 * doit alors envoyer un `multipart/form-data` avec exactement les `fields`
 * renvoyés (dans l'ordre), le fichier en dernier champ.
 */
export interface PresignedUploadPost {
  url: string;
  fields: Record<string, string>;
}

export const createPresignedUploadPost = async (
  key: string,
  contentType: string,
  maxSizeBytes: number
): Promise<PresignedUploadPost> => {
  const conditions: Array<["content-length-range", number, number] | ["eq", string, string]> = [
    ['content-length-range', 0, maxSizeBytes],
    ['eq', '$Content-Type', contentType],
  ];
  const Fields: Record<string, string> = { 'Content-Type': contentType };
  const sse = process.env.S3_SSE?.trim();
  if (sse === 'AES256') {
    conditions.push(['eq', '$x-amz-server-side-encryption', 'AES256']);
    Fields['x-amz-server-side-encryption'] = 'AES256';
  } else if (sse === 'aws:kms') {
    conditions.push(['eq', '$x-amz-server-side-encryption', 'aws:kms']);
    Fields['x-amz-server-side-encryption'] = 'aws:kms';
    const kmsKey = process.env.S3_SSE_KMS_KEY_ID?.trim();
    if (kmsKey) {
      conditions.push(['eq', '$x-amz-server-side-encryption-aws-kms-key-id', kmsKey]);
      Fields['x-amz-server-side-encryption-aws-kms-key-id'] = kmsKey;
    }
  }

  const { url, fields } = await createPresignedPost(getClient(), {
    Bucket: getBucket(),
    Key: key,
    Conditions: conditions,
    Fields,
    Expires: 300,
  });
  return { url, fields };
};

/** URL signée de téléchargement (GET) — 1 heure de validité par défaut. */
export const getPresignedDownloadUrl = async (key: string, expiresInSeconds = 3600): Promise<string> => {
  const command = new GetObjectCommand({ Bucket: getBucket(), Key: key });
  return getSignedUrl(getClient(), command, { expiresIn: expiresInSeconds });
};

export const deleteObject = async (key: string): Promise<void> => {
  await getClient().send(new DeleteObjectCommand({ Bucket: getBucket(), Key: key }));
};

export interface ListedObject {
  key: string;
  lastModified: Date;
  sizeBytes: number;
}

/** NFR-005/006 : utilisé par le nettoyage de rétention des sauvegardes
 * (`lib/backup.ts`) — pagine automatiquement (un bucket de sauvegardes peut
 * dépasser les 1000 objets renvoyés par un seul appel S3). */
export const listObjects = async (prefix: string): Promise<ListedObject[]> => {
  const results: ListedObject[] = [];
  let continuationToken: string | undefined;
  do {
    const response = await getClient().send(
      new ListObjectsV2Command({ Bucket: getBucket(), Prefix: prefix, ContinuationToken: continuationToken })
    );
    for (const obj of response.Contents ?? []) {
      if (obj.Key && obj.LastModified) {
        results.push({ key: obj.Key, lastModified: obj.LastModified, sizeBytes: obj.Size ?? 0 });
      }
    }
    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);
  return results;
};

/** Upload direct depuis le serveur (contenu déjà en mémoire côté API — ex.
 * un PDF généré, cf. `documents.routes.ts`), à la différence de
 * `createPresignedUploadPost` qui délègue l'upload au navigateur. */
export const uploadObject = async (key: string, body: Buffer | Uint8Array, contentType: string): Promise<void> => {
  const sse = process.env.S3_SSE?.trim();
  await getClient().send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
      ...(sse === 'AES256'
        ? { ServerSideEncryption: 'AES256' }
        : sse === 'aws:kms'
          ? {
              ServerSideEncryption: 'aws:kms',
              ...(process.env.S3_SSE_KMS_KEY_ID
                ? { SSEKMSKeyId: process.env.S3_SSE_KMS_KEY_ID }
                : {}),
            }
          : {}),
    })
  );
};

/** Récupère le contenu d'un objet côté serveur (ex. un logo d'établissement
 * à intégrer dans un PDF généré, cf. DOC-002) — jamais exposé tel quel au
 * navigateur, toujours re-servi via une URL signée ou intégré directement. */
export const getObjectBytes = async (key: string): Promise<Buffer> => {
  const response = await getClient().send(new GetObjectCommand({ Bucket: getBucket(), Key: key }));
  const stream = response.Body as import('stream').Readable;
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};
