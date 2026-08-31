import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useResolvedStoredUrl } from './useResolvedStoredUrl';

vi.mock('@/lib/storedFileAccess', () => ({
  resolveStoredFileDisplayUrl: vi.fn(async (key: string) => `blob:resolved-${key}`),
}));

import { resolveStoredFileDisplayUrl } from '@/lib/storedFileAccess';

describe('useResolvedStoredUrl', () => {
  beforeEach(() => {
    vi.mocked(resolveStoredFileDisplayUrl).mockClear();
  });

  it('passe les URL directes sans appeler l’API', async () => {
    const { result } = renderHook(() => useResolvedStoredUrl('https://cdn.example/a.png'));
    await waitFor(() => expect(result.current).toBe('https://cdn.example/a.png'));
    expect(resolveStoredFileDisplayUrl).not.toHaveBeenCalled();
  });

  it('résout une clé stockage via resolveStoredFileDisplayUrl', async () => {
    const { result } = renderHook(() => useResolvedStoredUrl('avatars/user-1/photo.webp'));
    await waitFor(() => expect(result.current).toBe('blob:resolved-avatars/user-1/photo.webp'));
    expect(resolveStoredFileDisplayUrl).toHaveBeenCalledWith('avatars/user-1/photo.webp');
  });

  it('retourne null sans clé', async () => {
    const { result } = renderHook(() => useResolvedStoredUrl(null));
    await waitFor(() => expect(result.current).toBeNull());
  });
});
