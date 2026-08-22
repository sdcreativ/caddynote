import { describe, it, expect } from 'vitest';
import { previewCsvRows } from './csvPreview';

describe('previewCsvRows', () => {
  it('affiche l’en-tête et les premières lignes, sans BOM', () => {
    const rows = previewCsvRows('\uFEFFstudentNumber,gradeValue\nMAT-001,14\nMAT-002,12\n');
    expect(rows[0]).toEqual(['studentNumber', 'gradeValue']);
    expect(rows[1]).toEqual(['MAT-001', '14']);
    expect(rows).toHaveLength(3);
  });
});
