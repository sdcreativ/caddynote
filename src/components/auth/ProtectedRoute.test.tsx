import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TEACHING_ROLES } from '@/lib/roles';
import type { StrkUserRole } from '@/types/strk';

const authState = vi.hoisted(() => ({
  user: null as { role: StrkUserRole } | null,
  isLoading: false,
}));

vi.mock('@/hooks/useStrkAuth', () => ({
  useStrkAuth: () => ({
    user: authState.user,
    isLoading: authState.isLoading,
  }),
}));

vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({
    hasPermission: () => false,
  }),
}));

import ProtectedRoute from './ProtectedRoute';

const renderAt = (role: StrkUserRole | null) => {
  authState.user = role ? { role } : null;
  authState.isLoading = false;
  return render(
    <MemoryRouter initialEntries={['/teacher-attendance']}>
      <Routes>
        <Route path="/sign" element={<div>login</div>} />
        <Route path="/dashboard" element={<div>dashboard</div>} />
        <Route
          path="/teacher-attendance"
          element={
            <ProtectedRoute requiredRoles={TEACHING_ROLES}>
              <div>appel</div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>
  );
};

describe('ProtectedRoute — familles de rôles', () => {
  beforeEach(() => {
    authState.user = null;
    authState.isLoading = false;
  });

  it('envoie vers /sign sans session', () => {
    renderAt(null);
    expect(screen.getByText('login')).toBeInTheDocument();
  });

  it('laisse passer teacher et head_teacher', () => {
    const { unmount } = renderAt('teacher');
    expect(screen.getByText('appel')).toBeInTheDocument();
    unmount();
    renderAt('head_teacher');
    expect(screen.getByText('appel')).toBeInTheDocument();
  });

  it('renvoie un parent vers le dashboard (plus un 403 API après clic)', () => {
    renderAt('parent');
    expect(screen.getByText('dashboard')).toBeInTheDocument();
  });
});
