import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  apiClient,
  ApiError,
  getToken,
  setToken,
  clearToken,
  setUnauthorizedHandler,
} from './apiClient';

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

describe('apiClient', () => {
  beforeEach(() => {
    clearToken();
    setUnauthorizedHandler(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('stockage du jeton', () => {
    it('renvoie null tant qu’aucun jeton n’est stocké', () => {
      expect(getToken()).toBeNull();
    });

    it('stocke puis efface le jeton', () => {
      setToken('abc.def.ghi');
      expect(getToken()).toBe('abc.def.ghi');
      clearToken();
      expect(getToken()).toBeNull();
    });
  });

  describe('requêtes', () => {
    it('envoie le jeton en en-tête Authorization quand il est présent', async () => {
      setToken('my-token');
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
      vi.stubGlobal('fetch', fetchMock);

      await apiClient.get('/me');

      const [, init] = fetchMock.mock.calls[0];
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer my-token');
    });

    it('omet l’en-tête Authorization quand skipAuth est demandé', async () => {
      setToken('my-token');
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
      vi.stubGlobal('fetch', fetchMock);

      await apiClient.post('/auth/login', { email: 'a@b.c' }, { skipAuth: true });

      const [, init] = fetchMock.mock.calls[0];
      expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    });

    it('renvoie le corps JSON en cas de succès', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ user: { id: '1' } })));
      const result = await apiClient.get<{ user: { id: string } }>('/auth/me');
      expect(result.user.id).toBe('1');
    });

    it('lève une ApiError avec le message et le statut du serveur en cas d’échec', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(jsonResponse({ error: 'Permissions insuffisantes' }, 403))
      );
      await expect(apiClient.get('/students/x')).rejects.toMatchObject({
        message: 'Permissions insuffisantes',
        status: 403,
      });
    });

    it('déclenche le handler 401 (déconnexion) sauf si skipAuth', async () => {
      const onUnauthorized = vi.fn();
      setUnauthorizedHandler(onUnauthorized);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'Jeton invalide' }, 401)));

      await expect(apiClient.get('/auth/me')).rejects.toThrow(ApiError);
      expect(onUnauthorized).toHaveBeenCalledTimes(1);
    });

    it('ne déclenche pas le handler 401 pour une requête skipAuth (ex. login échoué)', async () => {
      const onUnauthorized = vi.fn();
      setUnauthorizedHandler(onUnauthorized);
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(jsonResponse({ error: 'E-mail ou mot de passe incorrect' }, 401))
      );

      await expect(
        apiClient.post('/auth/login', { email: 'a@b.c', password: 'x' }, { skipAuth: true })
      ).rejects.toThrow(ApiError);
      expect(onUnauthorized).not.toHaveBeenCalled();
    });
  });
});
