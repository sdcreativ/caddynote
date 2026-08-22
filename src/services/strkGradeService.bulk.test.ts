import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiError } from '@/lib/apiClient';

vi.mock('@/lib/apiClient', async () => {
  const actual = await vi.importActual<typeof import('@/lib/apiClient')>('@/lib/apiClient');
  return {
    ...actual,
    apiClient: {
      post: vi.fn(),
    },
  };
});

import { apiClient } from '@/lib/apiClient';
import { createGradesBulk } from './strkGradeService';

describe('createGradesBulk (EVA-003 grille)', () => {
  beforeEach(() => {
    vi.mocked(apiClient.post).mockReset();
  });

  it('retourne count en cas de succès', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ count: 3 });
    const result = await createGradesBulk({
      course_id: 'c1',
      teacher_id: 't1',
      period_id: 'p1',
      title: 'DS1',
      entries: [{ student_id: 's1', grade_value: 12 }],
    });
    expect(result).toEqual({ count: 3 });
  });

  it('surface le message ApiError au lieu de null opaque', async () => {
    vi.mocked(apiClient.post).mockRejectedValue(new ApiError('Période invalide', 400));
    const result = await createGradesBulk({
      course_id: 'c1',
      teacher_id: 't1',
      period_id: 'p1',
      title: 'DS1',
      entries: [{ student_id: 's1', grade_value: 12 }],
    });
    expect(result).toEqual({ error: 'Période invalide' });
  });
});
