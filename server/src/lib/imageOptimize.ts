import sharp from 'sharp';

/** MIME images convertibles en WebP (dashboard + public). */
export const OPTIMIZABLE_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

export const isOptimizableImageMime = (contentType: string): boolean =>
  OPTIMIZABLE_IMAGE_MIMES.has(contentType.split(';')[0].trim().toLowerCase());

/** Côté long max — photos de profil / logos. */
export const AVATAR_MAX_EDGE_PX = 1024;

/** Côté long max — pièces, messages, cours, admissions (lisibilité scan). */
export const DOCUMENT_IMAGE_MAX_EDGE_PX = 2560;

/** Qualité WebP (0–100). */
export const WEBP_QUALITY = 82;

export class ImageOptimizeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageOptimizeError';
  }
}

/** Remplace l’extension du nom de fichier / clé objet par `.webp`. */
export const withWebpExtension = (nameOrKey: string): string => {
  const slash = nameOrKey.lastIndexOf('/');
  const dir = slash >= 0 ? nameOrKey.slice(0, slash + 1) : '';
  const base = slash >= 0 ? nameOrKey.slice(slash + 1) : nameOrKey;
  const dot = base.lastIndexOf('.');
  const stem = dot > 0 ? base.slice(0, dot) : base;
  return `${dir}${stem || 'image'}.webp`;
};

export const maxEdgeForFolder = (folder: string | undefined): number =>
  folder === 'avatars' ? AVATAR_MAX_EDGE_PX : DOCUMENT_IMAGE_MAX_EDGE_PX;

/**
 * Convertit JPEG/PNG/WebP/GIF (décodables par sharp) en WebP redimensionné.
 * Refuse PDF, SVG et buffers non image.
 */
export const optimizeImageToWebp = async (
  input: Buffer,
  options?: { maxEdgePx?: number; quality?: number }
): Promise<{ buffer: Buffer; contentType: 'image/webp' }> => {
  const maxEdgePx = options?.maxEdgePx ?? DOCUMENT_IMAGE_MAX_EDGE_PX;
  const quality = options?.quality ?? WEBP_QUALITY;

  try {
    const pipeline = sharp(input, { failOn: 'error', animated: false }).rotate();
    const meta = await pipeline.metadata();
    if (!meta.format || meta.format === 'svg' || meta.format === 'pdf') {
      throw new ImageOptimizeError('Format d’image non supporté');
    }

    const buffer = await pipeline
      .resize({
        width: maxEdgePx,
        height: maxEdgePx,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality, effort: 4 })
      .toBuffer();

    return { buffer, contentType: 'image/webp' };
  } catch (err) {
    if (err instanceof ImageOptimizeError) throw err;
    throw new ImageOptimizeError(
      err instanceof Error ? err.message : 'Impossible d’optimiser l’image'
    );
  }
};

/**
 * Si le MIME est une image : convertit en WebP et renomme la clé.
 * Sinon : laisse le buffer et la clé inchangés (PDF, Word, etc.).
 */
export const maybeOptimizeUploadedImage = async (
  body: Buffer,
  contentType: string,
  key: string,
  options?: { maxEdgePx?: number }
): Promise<{
  body: Buffer;
  contentType: string;
  key: string;
  optimized: boolean;
}> => {
  if (!isOptimizableImageMime(contentType)) {
    return { body, contentType, key, optimized: false };
  }
  const optimized = await optimizeImageToWebp(body, {
    maxEdgePx: options?.maxEdgePx ?? DOCUMENT_IMAGE_MAX_EDGE_PX,
  });
  return {
    body: optimized.buffer,
    contentType: optimized.contentType,
    key: withWebpExtension(key),
    optimized: true,
  };
};
