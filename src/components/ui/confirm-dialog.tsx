import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type ConfirmOptions = {
  title?: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Bouton confirmer destructif (suppression, anonymisation…). */
  variant?: 'default' | 'destructive';
};

type ConfirmFn = (options: ConfirmOptions | string) => Promise<boolean>;

const ConfirmDialogContext = createContext<ConfirmFn | null>(null);

type Pending = {
  options: ConfirmOptions;
  resolve: (value: boolean) => void;
};

const normalizeOptions = (input: ConfirmOptions | string): ConfirmOptions =>
  typeof input === 'string' ? { description: input } : input;

/**
 * Remplace `window.confirm` par une AlertDialog Radix cohérente avec l’UI.
 * Usage : `const ok = await confirm({ description: '…', variant: 'destructive' });`
 */
export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation('common');
  const [pending, setPending] = useState<Pending | null>(null);
  const pendingRef = useRef<Pending | null>(null);

  const close = useCallback((value: boolean) => {
    const current = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    current?.resolve(value);
  }, []);

  const confirm = useCallback<ConfirmFn>((input) => {
    const options = normalizeOptions(input);
    return new Promise<boolean>((resolve) => {
      // Une seule confirmation à la fois : la précédente est annulée.
      if (pendingRef.current) {
        pendingRef.current.resolve(false);
      }
      const next = { options, resolve };
      pendingRef.current = next;
      setPending(next);
    });
  }, []);

  const value = useMemo(() => confirm, [confirm]);
  const open = pending !== null;
  const opts = pending?.options;

  return (
    <ConfirmDialogContext.Provider value={value}>
      {children}
      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          if (!next) close(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{opts?.title ?? t('actions.confirm')}</AlertDialogTitle>
            <AlertDialogDescription>{opts?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {opts?.cancelLabel ?? t('actions.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              className={cn(
                opts?.variant === 'destructive' &&
                  buttonVariants({ variant: 'destructive' })
              )}
              onClick={(e) => {
                e.preventDefault();
                close(true);
              }}
            >
              {opts?.confirmLabel ??
                (opts?.variant === 'destructive' ? t('actions.delete') : t('actions.confirm'))}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmDialogContext.Provider>
  );
}

export function useConfirmDialog(): ConfirmFn {
  const ctx = useContext(ConfirmDialogContext);
  if (!ctx) {
    throw new Error('useConfirmDialog doit être utilisé dans ConfirmDialogProvider');
  }
  return ctx;
}
