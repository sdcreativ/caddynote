import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OfflineBanner } from './OfflineBanner';

const mockUseOfflineSync = vi.fn();

vi.mock('@/hooks/useOfflineSync', () => ({
  useOfflineSync: () => mockUseOfflineSync(),
}));

describe('OfflineBanner (UX-005)', () => {
  beforeEach(() => {
    mockUseOfflineSync.mockReset();
  });

  it('ne s’affiche pas en ligne', () => {
    mockUseOfflineSync.mockReturnValue({ isOnline: true, pendingCount: 0 });
    const { container } = render(<OfflineBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('annonce hors ligne et la file d’attente d’appel', () => {
    mockUseOfflineSync.mockReturnValue({ isOnline: false, pendingCount: 3 });
    render(<OfflineBanner />);
    expect(screen.getByRole('status')).toHaveTextContent(/3/);
    expect(screen.getByRole('status')).toHaveTextContent(/Hors ligne/i);
  });
});
