import type { StrkDocumentType } from '@prisma/client';

/**
 * Préfixes S3 / stockage local (DOC-005).
 * Clés : `{folder}/{tenantScope}/…`
 *
 * Noms métier en français pour lisibilité bucket + policy IAM par préfixe.
 * Ne pas confondre avec les routes HTTP (`/assignments`, `/admissions`, …).
 */
export const STORAGE_FOLDERS = [
  'avatars',
  /** Logos / gabarits (upload navigateur) */
  'documents',
  'devoirs',
  'exercices',
  'messages',
  'recus',
  'factures',
  'bulletins',
  'releves',
  'certificats',
  'attestations',
  'cartes',
  'listes',
  'confirmations',
  'cours',
  'inscription',
  'justificatifs',
  /** Sauvegardes DB (écritures serveur uniquement, pas /files/presign-upload) */
  'backups',
] as const;

export type StorageFolder = (typeof STORAGE_FOLDERS)[number];

/** Dossiers ouverts au POST /files/presign-upload (navigateur). */
export const UPLOAD_FOLDERS = [
  'avatars',
  'documents',
  'devoirs',
  'exercices',
  'messages',
  'recus',
  'cours',
  'inscription',
  'justificatifs',
] as const satisfies readonly StorageFolder[];

export type UploadFolder = (typeof UPLOAD_FOLDERS)[number];

/** Alias stables pour le code métier. */
export const STORAGE_FOLDER = {
  avatars: 'avatars',
  documents: 'documents',
  devoirs: 'devoirs',
  exercices: 'exercices',
  messages: 'messages',
  recus: 'recus',
  factures: 'factures',
  bulletins: 'bulletins',
  releves: 'releves',
  certificats: 'certificats',
  attestations: 'attestations',
  cartes: 'cartes',
  listes: 'listes',
  confirmations: 'confirmations',
  cours: 'cours',
  inscription: 'inscription',
  justificatifs: 'justificatifs',
  backups: 'backups',
} as const satisfies Record<string, StorageFolder>;

/** Dossier S3 pour un PDF officiel généré (DOC-001). */
export const folderForDocumentType = (type: StrkDocumentType): StorageFolder => {
  switch (type) {
    case 'invoice':
      return STORAGE_FOLDER.factures;
    case 'payment_receipt':
      return STORAGE_FOLDER.recus;
    case 'report_card':
      return STORAGE_FOLDER.bulletins;
    case 'transcript':
      return STORAGE_FOLDER.releves;
    case 'enrollment_certificate':
      return STORAGE_FOLDER.certificats;
    case 'school_attestation':
      return STORAGE_FOLDER.attestations;
    case 'student_card':
      return STORAGE_FOLDER.cartes;
    case 'class_list':
      return STORAGE_FOLDER.listes;
    case 'admission_confirmation':
      return STORAGE_FOLDER.confirmations;
    default:
      return STORAGE_FOLDER.documents;
  }
};

export const isStorageFolder = (value: string): value is StorageFolder =>
  (STORAGE_FOLDERS as readonly string[]).includes(value);

export const isUploadFolder = (value: string): value is UploadFolder =>
  (UPLOAD_FOLDERS as readonly string[]).includes(value);
