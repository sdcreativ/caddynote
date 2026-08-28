import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import {
  optimizeImageToWebp,
  withWebpExtension,
  ImageOptimizeError,
  isOptimizableImageMime,
  maybeOptimizeUploadedImage,
} from '../lib/imageOptimize.js';

describe('imageOptimize', () => {
  it('withWebpExtension remplace l’extension', () => {
    expect(withWebpExtension('photo.PNG')).toBe('photo.webp');
    expect(withWebpExtension('avatars/inst-1/123-abc-logo.jpg')).toBe(
      'avatars/inst-1/123-abc-logo.webp'
    );
    expect(withWebpExtension('sans-ext')).toBe('sans-ext.webp');
  });

  it('détecte les MIME images convertibles', () => {
    expect(isOptimizableImageMime('image/jpeg')).toBe(true);
    expect(isOptimizableImageMime('image/png')).toBe(true);
    expect(isOptimizableImageMime('application/pdf')).toBe(false);
  });

  it('convertit un PNG en WebP plus compact', async () => {
    const png = await sharp({
      create: { width: 800, height: 600, channels: 3, background: { r: 30, g: 112, b: 216 } },
    })
      .png()
      .toBuffer();

    const result = await optimizeImageToWebp(png);
    expect(result.contentType).toBe('image/webp');
    expect(result.buffer.length).toBeGreaterThan(0);
    expect(result.buffer.length).toBeLessThan(png.length);

    const meta = await sharp(result.buffer).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBeLessThanOrEqual(2560);
    expect(meta.height).toBeLessThanOrEqual(2560);
  });

  it('maybeOptimizeUploadedImage laisse les PDF inchangés', async () => {
    const pdf = Buffer.from('%PDF-1.4 fake');
    const result = await maybeOptimizeUploadedImage(pdf, 'application/pdf', 'documents/x/a.pdf');
    expect(result.optimized).toBe(false);
    expect(result.key).toBe('documents/x/a.pdf');
    expect(result.body).toEqual(pdf);
  });

  it('refuse un buffer non image pour optimizeImageToWebp', async () => {
    await expect(optimizeImageToWebp(Buffer.from('%PDF-1.4 fake'))).rejects.toBeInstanceOf(
      ImageOptimizeError
    );
  });
});
