import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import UsersManagement from './UsersManagement';
import { useStrkAuth } from '@/hooks/useStrkAuth';

const { loadUsersByInstitution, loadAllUsers, updateUser, assignToInstitution, deleteUser, reactivateUser } =
  vi.hoisted(() => ({
    loadUsersByInstitution: vi.fn(),
    loadAllUsers: vi.fn(),
    updateUser: vi.fn(),
    assignToInstitution: vi.fn(),
    deleteUser: vi.fn(),
    reactivateUser: vi.fn(),
  }));

vi.mock('@/hooks/useStrkAuth', () => ({
  useStrkAuth: vi.fn(),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/hooks/useStrkUsers', () => ({
  useStrkUsers: () => ({
    users: [
      {
        id: 'u1',
        name: 'Ada Lovelace',
        email: 'ada@ecole.fr',
        role: 'secretary',
        institutionId: 'inst-1',
        isActive: true,
      },
    ],
    isLoading: false,
    error: null,
    loadUsersByInstitution,
    loadAllUsers,
    updateUser,
    assignToInstitution,
    deleteUser,
    reactivateUser,
  }),
}));

vi.mock('@/hooks/useStrkInstitutions', () => ({
  useStrkInstitutions: () => ({
    institutions: [{ id: 'inst-1', name: 'Lycée Test' }],
  }),
}));

vi.mock('@/lib/apiClient', () => ({
  apiClient: { post: vi.fn(), get: vi.fn() },
  ApiError: class ApiError extends Error {},
}));

const mockedAuth = vi.mocked(useStrkAuth);

describe('UsersManagement (comptes vs métier)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadUsersByInstitution.mockResolvedValue([]);
    mockedAuth.mockReturnValue({
      user: { id: 'adm-1', role: 'school_admin', institutionId: 'inst-1' },
      isLoading: false,
    } as ReturnType<typeof useStrkAuth>);
  });

  it('oriente vers /students et /teachers pour la création métier', async () => {
    render(
      <MemoryRouter>
        <UsersManagement />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(loadUsersByInstitution).toHaveBeenCalledWith('inst-1');
    });

    const studentLinks = screen.getAllByRole('link', { name: /Créer un élève/i });
    const teacherLinks = screen.getAllByRole('link', { name: /Créer un enseignant/i });
    expect(studentLinks.length).toBeGreaterThanOrEqual(1);
    expect(teacherLinks.length).toBeGreaterThanOrEqual(1);
    expect(studentLinks.every((a) => a.getAttribute('href') === '/students')).toBe(true);
    expect(teacherLinks.every((a) => a.getAttribute('href') === '/teachers')).toBe(true);
    expect(screen.queryByLabelText(/Classe/i)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Comptes & accès/i })).toBeInTheDocument();
  });

  it('n’offre pas les rôles élève/enseignant à la création de compte', async () => {
    render(
      <MemoryRouter>
        <UsersManagement />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /Ajouter un compte/i }));

    await waitFor(() => {
      expect(screen.getByText(/Ajouter un compte d’accès/i)).toBeInTheDocument();
    });

    // Ouvre le select rôle : les options métier ne doivent pas apparaître.
    fireEvent.click(screen.getByRole('combobox', { name: /Rôle/i }));
    expect(screen.queryByRole('option', { name: /^Élève$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /^Enseignant$/i })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Secrétariat/i })).toBeInTheDocument();
  });

  it('redirige l’admin plateforme sans établissement vers /super-admin/users', async () => {
    mockedAuth.mockReturnValue({
      user: { id: 'plat-1', role: 'admin', institutionId: null },
      isLoading: false,
    } as ReturnType<typeof useStrkAuth>);

    render(
      <MemoryRouter initialEntries={['/users']}>
        <Routes>
          <Route path="/users" element={<UsersManagement />} />
          <Route path="/super-admin/users" element={<div>Comptes plateforme SA</div>} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Comptes plateforme SA/i)).toBeInTheDocument();
    });
    expect(loadUsersByInstitution).not.toHaveBeenCalled();
    expect(loadAllUsers).not.toHaveBeenCalled();
  });

  it('rappelle le périmètre école pour un admin avec établissement', async () => {
    mockedAuth.mockReturnValue({
      user: { id: 'adm-2', role: 'admin', institutionId: 'inst-1' },
      isLoading: false,
    } as ReturnType<typeof useStrkAuth>);

    render(
      <MemoryRouter>
        <UsersManagement />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(loadUsersByInstitution).toHaveBeenCalledWith('inst-1');
    });
    expect(screen.getByText(/Périmètre établissement uniquement/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Comptes plateforme/i })).toHaveAttribute(
      'href',
      '/super-admin/users'
    );
  });
});
