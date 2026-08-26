import { describe, it, expect } from 'vitest';
import { inferUploadContentType } from './s3Upload';

describe('inferUploadContentType', () => {
  it('conserve un type MIME explicite', () => {
    const file = new File(['x'], 'doc.pdf', { type: 'application/pdf' });
    expect(inferUploadContentType(file)).toBe('application/pdf');
  });

  it('déduit le type depuis l’extension si File.type est vide', () => {
    const file = new File(['x'], '05_2023.pdf', { type: '' });
    expect(inferUploadContentType(file)).toBe('application/pdf');
  });

  it('déduit jpeg / png', () => {
    expect(inferUploadContentType(new File(['x'], 'a.JPG', { type: '' }))).toBe('image/jpeg');
    expect(inferUploadContentType(new File(['x'], 'b.png', { type: '' }))).toBe('image/png');
  });
});
