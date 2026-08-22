import { createContext, useContext, type ReactNode } from 'react';
import { useEstablishmentDashboard } from '@/hooks/useEstablishmentDashboard';

type DashboardValue = ReturnType<typeof useEstablishmentDashboard>;

const EstablishmentDashboardContext = createContext<DashboardValue | null>(null);

export function EstablishmentDashboardProvider({ children }: { children: ReactNode }) {
  const value = useEstablishmentDashboard();
  return (
    <EstablishmentDashboardContext.Provider value={value}>{children}</EstablishmentDashboardContext.Provider>
  );
}

export function useEstablishmentDashboardContext(): DashboardValue {
  const ctx = useContext(EstablishmentDashboardContext);
  if (!ctx) {
    throw new Error('useEstablishmentDashboardContext must be used within EstablishmentDashboardProvider');
  }
  return ctx;
}
