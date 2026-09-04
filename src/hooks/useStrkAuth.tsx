import { useState, useEffect, useCallback, createContext, useContext, ReactNode } from 'react';
import { User as StrkUser, StrkUserRole } from '@/types/strk';
import { apiClient, ApiError, clearToken, setUnauthorizedHandler } from '@/lib/apiClient';
import { useToast } from '@/hooks/use-toast';
import { homePathForRole } from '@/lib/homePath';

interface ApiProfile {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phoneNumber: string | null;
  profileImage: string | null;
  role: StrkUserRole;
  institutionId: string | null;
  mfaEnabled?: boolean;
  mustChangePassword?: boolean;
}

const mapApiProfileToUser = (profile: ApiProfile): StrkUser => ({
  id: profile.id,
  name: [profile.firstName, profile.lastName].filter(Boolean).join(' ') || profile.email || 'Utilisateur',
  email: profile.email || undefined,
  role: profile.role,
  profileImage: profile.profileImage || undefined,
  phoneNumber: profile.phoneNumber || undefined,
  institutionId: profile.institutionId || undefined,
  mfaEnabled: profile.mfaEnabled ?? false,
});

export type ImpersonationState = {
  active: boolean;
  impersonatorId?: string;
  expiresAt?: string | null;
};

interface StrkAuthContextType {
  user: StrkUser | null;
  isLoading: boolean;
  authError: string | null;
  login: (
    email: string,
    password: string
  ) => Promise<{ mfaRequired: boolean; role?: StrkUserRole }>;
  verifyMfaCode: (code: string) => Promise<{ role: StrkUserRole }>;
  cancelMfaChallenge: () => void;
  /** Échange le code SSO (fragment) contre le cookie, ou démarre le MFA. */
  acceptSsoCode: (code: string) => Promise<{ role?: StrkUserRole; mfaRequired?: boolean }>;
  /** Démarre l’étape MFA après SSO (challenge renvoyé par /auth/adopt). */
  beginSsoMfaChallenge: (challengeToken: string) => void;
  logout: () => Promise<void>;
  hasRole: (role: StrkUserRole) => boolean;
  signup: (email: string, password: string, userData?: { first_name?: string; last_name?: string; role?: StrkUserRole; phone_number?: string; institution?: string }) => Promise<void>;
  /** MFA obligatoire (rôles sensibles) — dialog non dismissible. */
  mfaSetupRequired: boolean;
  mfaRecommended: boolean;
  /** ISO date fin de grâce MFA (bandeau). */
  mfaGraceUntil: string | null;
  mustChangePassword: boolean;
  clearMustChangePassword: () => void;
  dismissMfaPrompt: () => void;
  markMfaEnabled: () => void;
  impersonation: ImpersonationState;
  startImpersonation: (
    userId: string,
    options?: { durationMinutes?: number; reason: string; supportTicketId?: string }
  ) => Promise<void>;
  exitImpersonation: () => Promise<void>;
}

const StrkAuthContext = createContext<StrkAuthContextType | undefined>(undefined);

export const StrkAuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<StrkUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [mfaSetupRequired, setMfaSetupRequired] = useState(false);
  const [mfaRecommended, setMfaRecommended] = useState(false);
  const [mfaGraceUntil, setMfaGraceUntil] = useState<string | null>(null);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [mfaPromptDismissed, setMfaPromptDismissed] = useState(false);
  const [mfaChallengeToken, setMfaChallengeToken] = useState<string | null>(null);
  const [impersonation, setImpersonation] = useState<ImpersonationState>({ active: false });
  const { toast } = useToast();

  const applyMfaFlags = useCallback(
    (flags?: {
      mfaSetupRequired?: boolean;
      mfaRecommended?: boolean;
      mustChangePassword?: boolean;
      mfaGraceUntil?: string | null;
    }) => {
      setMfaSetupRequired(!!flags?.mfaSetupRequired);
      setMfaRecommended(!!flags?.mfaRecommended);
      setMustChangePassword(!!flags?.mustChangePassword);
      setMfaGraceUntil(flags?.mfaGraceUntil ?? null);
      setMfaPromptDismissed(false);
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      await apiClient.post('/auth/logout', {});
    } catch {
      /* session déjà invalide */
    }
    clearToken();
    setUser(null);
    setMfaSetupRequired(false);
    setMfaRecommended(false);
    setMfaGraceUntil(null);
    setMustChangePassword(false);
    setMfaPromptDismissed(false);
    setImpersonation({ active: false });
    window.location.href = '/sign';
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearToken();
      setUser(null);
      setImpersonation({ active: false });
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const refreshMe = useCallback(async () => {
    const me = await apiClient.get<{
      user: ApiProfile;
      mfaSetupRequired?: boolean;
      mfaRecommended?: boolean;
      mustChangePassword?: boolean;
      mfaGraceUntil?: string | null;
      impersonation?: ImpersonationState;
    }>('/auth/me');
    setUser(mapApiProfileToUser(me.user));
    applyMfaFlags({
      mfaSetupRequired: me.mfaSetupRequired,
      mfaRecommended: me.mfaRecommended,
      mustChangePassword: me.mustChangePassword ?? me.user.mustChangePassword,
      mfaGraceUntil: me.mfaGraceUntil ?? null,
    });
    setImpersonation(me.impersonation?.active ? me.impersonation : { active: false });
    return me;
  }, [applyMfaFlags]);

  useEffect(() => {
    clearToken();
    refreshMe()
      .catch(() => {
        setUser(null);
        setImpersonation({ active: false });
      })
      .finally(() => setIsLoading(false));
  }, [refreshMe]);

  const login = useCallback(async (
    email: string,
    password: string
  ): Promise<{ mfaRequired: boolean; role?: StrkUserRole }> => {
    setAuthError(null);
    try {
      const response = await apiClient.post<
        | { token: string; user: ApiProfile; mfaSetupRequired?: boolean; mfaRecommended?: boolean }
        | { mfaRequired: true; challengeToken: string }
      >('/auth/login', { email, password }, { skipAuth: true });

      if ('mfaRequired' in response) {
        setMfaChallengeToken(response.challengeToken);
        return { mfaRequired: true };
      }

      setUser(mapApiProfileToUser(response.user));
      try {
        await refreshMe();
      } catch {
        applyMfaFlags({});
      }
      return { mfaRequired: false, role: response.user.role };
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Erreur de connexion inattendue';
      setAuthError(message);
      throw new Error(message);
    }
  }, [applyMfaFlags, refreshMe]);

  const verifyMfaCode = useCallback(
    async (code: string): Promise<{ role: StrkUserRole }> => {
      if (!mfaChallengeToken) {
        throw new Error('Aucune vérification MFA en attente, reconnectez-vous');
      }
      setAuthError(null);
      try {
        const { user: profile } = await apiClient.post<{ token: string; user: ApiProfile }>(
          '/auth/mfa/login-verify',
          { challengeToken: mfaChallengeToken, code },
          { skipAuth: true }
        );
        setUser(mapApiProfileToUser(profile));
        setMfaChallengeToken(null);
        await refreshMe().catch(() => undefined);
        return { role: profile.role };
      } catch (error) {
        const message = error instanceof ApiError ? error.message : 'Erreur de vérification inattendue';
        setAuthError(message);
        throw new Error(message);
      }
    },
    [mfaChallengeToken, refreshMe]
  );

  const cancelMfaChallenge = useCallback(() => {
    setMfaChallengeToken(null);
    setAuthError(null);
  }, []);

  const acceptSsoCode = useCallback(
    async (code: string): Promise<{ role?: StrkUserRole; mfaRequired?: boolean }> => {
      setAuthError(null);
      const adopted = await apiClient.post<{
        ok?: boolean;
        mfaRequired?: boolean;
        challengeToken?: string;
      }>('/auth/adopt', { code }, { skipAuth: true });
      if (adopted.mfaRequired && adopted.challengeToken) {
        setMfaChallengeToken(adopted.challengeToken);
        return { mfaRequired: true };
      }
      const me = await refreshMe();
      return { role: me.user.role };
    },
    [refreshMe]
  );

  const beginSsoMfaChallenge = useCallback((challengeToken: string) => {
    setMfaChallengeToken(challengeToken);
    setAuthError(null);
  }, []);

  const signup = useCallback(
    async (
      email: string,
      password: string,
      userData?: { first_name?: string; last_name?: string; role?: StrkUserRole; phone_number?: string; institution?: string }
    ) => {
      setIsLoading(true);
      try {
        const { user: profile } = await apiClient.post<{ token: string; user: ApiProfile }>(
          '/auth/register',
          {
            email,
            password,
            firstName: userData?.first_name,
            lastName: userData?.last_name,
            role: userData?.role || 'student',
            phoneNumber: userData?.phone_number,
          },
          { skipAuth: true }
        );
        setUser(mapApiProfileToUser(profile));
        toast({ title: 'Compte créé', description: 'Bienvenue sur CaddyNote' });
      } catch (error) {
        const message = error instanceof ApiError ? error.message : "Erreur lors de l'inscription";
        throw new Error(message);
      } finally {
        setIsLoading(false);
      }
    },
    [toast]
  );

  const startImpersonation = useCallback(
    async (
      userId: string,
      options?: { durationMinutes?: number; reason: string; supportTicketId?: string }
    ) => {
      const reason = options?.reason;
      if (!reason || reason.trim().length < 10) {
        throw new Error('Motif d’impersonation requis (10 caractères min.)');
      }
      const res = await apiClient.post<{
        token: string;
        expiresAt: string;
        user: ApiProfile;
        impersonatorId: string;
      }>('/admin/impersonate', {
        userId,
        durationMinutes: options?.durationMinutes ?? 15,
        reason: reason.trim(),
        supportTicketId: options?.supportTicketId,
      });
      setUser(mapApiProfileToUser(res.user));
      setImpersonation({
        active: true,
        impersonatorId: res.impersonatorId,
        expiresAt: res.expiresAt,
      });
      toast({
        title: 'Impersonation active',
        description: `Session limitée jusqu’à ${new Date(res.expiresAt).toLocaleString('fr-FR')}`,
      });
      window.location.href = homePathForRole(res.user.role);
    },
    [toast]
  );

  const exitImpersonation = useCallback(async () => {
    const res = await apiClient.post<{ token: string; user: ApiProfile }>('/admin/impersonate/exit', {});
    setUser(mapApiProfileToUser(res.user));
    setImpersonation({ active: false });
    toast({ title: 'Retour console admin' });
    window.location.href = '/super-admin/support-ops';
  }, [toast]);

  const hasRole = (role: StrkUserRole): boolean => user?.role === role;

  const markMfaEnabled = useCallback(() => {
    setUser((current) => (current ? { ...current, mfaEnabled: true } : current));
    setMfaSetupRequired(false);
    setMfaRecommended(false);
    setMfaGraceUntil(null);
    setMfaPromptDismissed(false);
  }, []);

  const dismissMfaPrompt = useCallback(() => {
    setMfaPromptDismissed(true);
  }, []);

  const clearMustChangePassword = useCallback(() => {
    setMustChangePassword(false);
  }, []);

  const showMfaBanner =
    mfaRecommended &&
    !mfaSetupRequired &&
    !mustChangePassword &&
    !mfaPromptDismissed &&
    !!user &&
    !user.mfaEnabled;

  const value: StrkAuthContextType = {
    user,
    isLoading,
    authError,
    login,
    verifyMfaCode,
    cancelMfaChallenge,
    acceptSsoCode,
    beginSsoMfaChallenge,
    logout,
    hasRole,
    signup,
    mfaSetupRequired: mfaSetupRequired && !mustChangePassword,
    mfaRecommended: showMfaBanner,
    mfaGraceUntil,
    mustChangePassword,
    clearMustChangePassword,
    dismissMfaPrompt,
    markMfaEnabled,
    impersonation,
    startImpersonation,
    exitImpersonation,
  };

  return <StrkAuthContext.Provider value={value}>{children}</StrkAuthContext.Provider>;
};

export const useStrkAuth = () => {
  const context = useContext(StrkAuthContext);
  if (context === undefined) {
    throw new Error('useStrkAuth must be used within a StrkAuthProvider');
  }
  return context;
};
