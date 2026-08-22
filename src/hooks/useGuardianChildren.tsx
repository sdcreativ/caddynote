import { useState, useEffect, useCallback, createContext, useContext, ReactNode } from 'react';
import { useStrkAuth } from '@/hooks/useStrkAuth';
import { fetchChildrenForGuardian } from '@/services/strkGuardianService';
import { GuardianChildSummary } from '@/types/strk';

const SELECTED_CHILD_STORAGE_KEY = 'caddynote_selected_child_id';

interface GuardianChildrenContextType {
  children: GuardianChildSummary[];
  isLoading: boolean;
  error: string | null;
  selectedChildId: string | null;
  selectedChild: GuardianChildSummary | null;
  setSelectedChildId: (studentId: string) => void;
  refresh: () => Promise<void>;
}

const GuardianChildrenContext = createContext<GuardianChildrenContextType | undefined>(undefined);

/**
 * Fournit, pour un utilisateur ayant le rôle 'parent', la liste de ses enfants
 * (relations actives uniquement) et l'enfant actuellement sélectionné pour la
 * navigation "multi-enfants" (ELV-002).
 */
export const GuardianChildrenProvider = ({ children: reactChildren }: { children: ReactNode }) => {
  const { user } = useStrkAuth();
  const [children, setChildren] = useState<GuardianChildSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedChildId, setSelectedChildIdState] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(SELECTED_CHILD_STORAGE_KEY);
  });

  const refresh = useCallback(async () => {
    if (!user || user.role !== 'parent') {
      setChildren([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchChildrenForGuardian(user.id);
      setChildren(data);

      // Si l'enfant sélectionné n'appartient plus à la liste (ou aucun choix
      // n'a encore été fait), on retombe sur le premier enfant actif.
      setSelectedChildIdState((current) => {
        if (current && data.some((c) => c.studentId === current)) {
          return current;
        }
        return data[0]?.studentId ?? null;
      });
    } catch (err) {
      console.error('Error loading guardian children:', err);
      setError("Impossible de charger la liste des enfants");
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const setSelectedChildId = useCallback((studentId: string) => {
    setSelectedChildIdState(studentId);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(SELECTED_CHILD_STORAGE_KEY, studentId);
    }
  }, []);

  const selectedChild = children.find((c) => c.studentId === selectedChildId) ?? null;

  return (
    <GuardianChildrenContext.Provider
      value={{ children, isLoading, error, selectedChildId, selectedChild, setSelectedChildId, refresh }}
    >
      {reactChildren}
    </GuardianChildrenContext.Provider>
  );
};

export const useGuardianChildren = () => {
  const context = useContext(GuardianChildrenContext);
  if (context === undefined) {
    throw new Error('useGuardianChildren must be used within a GuardianChildrenProvider');
  }
  return context;
};
