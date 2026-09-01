import { createContext, useContext, useMemo, type ReactNode } from 'react';

type MobileShellContextValue = {
  openMoreMenu: () => void;
};

const MobileShellContext = createContext<MobileShellContextValue | null>(null);

export const MobileShellProvider = ({
  openMoreMenu,
  children,
}: {
  openMoreMenu: () => void;
  children: ReactNode;
}) => {
  const value = useMemo(() => ({ openMoreMenu }), [openMoreMenu]);
  return <MobileShellContext.Provider value={value}>{children}</MobileShellContext.Provider>;
};

/** Ouvre le menu latéral depuis un écran mobile (ex. ⋮ du Suivi). */
export const useMobileShell = (): MobileShellContextValue => {
  const ctx = useContext(MobileShellContext);
  if (!ctx) {
    return { openMoreMenu: () => undefined };
  }
  return ctx;
};
