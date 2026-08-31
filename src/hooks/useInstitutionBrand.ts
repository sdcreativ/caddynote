import { useEffect, useState } from 'react';
import { useStrkAuth } from '@/hooks/useStrkAuth';
import { useStrkInstitutions } from '@/hooks/useStrkInstitutions';
import { fetchChildrenForGuardian } from '@/services/strkGuardianService';

type BrandState = {
  institutionId: string | null;
  institutionName: string;
  institutionLogo: string | null;
};

const empty: BrandState = {
  institutionId: null,
  institutionName: '',
  institutionLogo: null,
};

/**
 * Nom + logo pour le chrome (sidebar / navbar) — direction, enseignant,
 * élève (institutionId JWT) et parent (établissement des enfants liés).
 */
export function useInstitutionBrand(): BrandState & { showInstitutionBrand: boolean } {
  const { user } = useStrkAuth();
  const { getInstitutionById, institutions } = useStrkInstitutions();
  const [state, setState] = useState<BrandState>(empty);

  const userId = user?.id;
  const userRole = user?.role;
  const userInstitutionId = user?.institutionId ?? null;
  // Identifiant stable de la liste (évite une boucle si le tableau est recréé à l’identique).
  const listKey = institutions.map((i) => `${i.id}:${i.logo ?? ''}:${i.name}`).join('|');

  useEffect(() => {
    let cancelled = false;

    const apply = (id: string, inst: { name?: string; logo?: string | null } | null) => {
      if (cancelled || !inst?.name) return;
      setState((prev) => {
        const next: BrandState = {
          institutionId: id,
          institutionName: inst.name!,
          institutionLogo: inst.logo ?? null,
        };
        if (
          prev.institutionId === next.institutionId &&
          prev.institutionName === next.institutionName &&
          prev.institutionLogo === next.institutionLogo
        ) {
          return prev;
        }
        return next;
      });
    };

    const run = async () => {
      if (!userId) {
        setState((prev) => (prev.institutionId || prev.institutionName ? empty : prev));
        return;
      }

      let targetId = userInstitutionId;
      if (!targetId && userRole === 'parent') {
        const children = await fetchChildrenForGuardian(userId);
        if (cancelled) return;
        targetId = children.find((c) => c.institutionId)?.institutionId ?? null;
      }

      if (!targetId) {
        setState((prev) => (prev.institutionId || prev.institutionName ? empty : prev));
        return;
      }

      const fromList = institutions.find((i) => i.id === targetId);
      if (fromList) {
        apply(targetId, fromList);
      } else {
        const inst = await getInstitutionById(targetId);
        apply(targetId, inst);
      }
    };

    void run();

    const onUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: string; name?: string; logo?: string | null }>).detail;
      if (!detail?.id) return;
      setState((prev) => {
        if (prev.institutionId && detail.id !== prev.institutionId) return prev;
        if (!prev.institutionId && detail.id !== userInstitutionId) return prev;
        return {
          institutionId: detail.id,
          institutionName: detail.name || prev.institutionName,
          institutionLogo: detail.logo !== undefined ? detail.logo : prev.institutionLogo,
        };
      });
    };
    window.addEventListener('strk:institution-updated', onUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener('strk:institution-updated', onUpdated);
    };
    // getInstitutionById volontairement omis : les mocks de test le recréent à chaque render.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- listKey couvre institutions
  }, [userId, userRole, userInstitutionId, listKey]);

  return {
    ...state,
    showInstitutionBrand: Boolean(state.institutionName),
  };
}
