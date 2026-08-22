import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export type PromptField = {
  name: string;
  label: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
  type?: 'text' | 'number' | 'select';
  options?: { value: string; label: string }[];
};

export type PromptOptions = {
  title?: string;
  description?: string;
  fields?: PromptField[];
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'destructive';
  /** L’utilisateur doit saisir exactement cette chaîne pour valider. */
  typeToConfirm?: string;
  typeToConfirmLabel?: string;
};

export type PromptResult = Record<string, string>;

type PromptFn = (options: PromptOptions) => Promise<PromptResult | null>;

const PromptDialogContext = createContext<PromptFn | null>(null);

type Pending = {
  options: PromptOptions;
  resolve: (value: PromptResult | null) => void;
};

const initialValues = (options: PromptOptions): Record<string, string> => {
  const values: Record<string, string> = {};
  for (const field of options.fields ?? []) {
    values[field.name] = field.defaultValue ?? '';
  }
  if (options.typeToConfirm) {
    values.__typeToConfirm = '';
  }
  return values;
};

/**
 * Remplace `window.prompt` par une modale formulaire (1+ champs, select, type-to-confirm).
 */
export function PromptDialogProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation('common');
  const [pending, setPending] = useState<Pending | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const pendingRef = useRef<Pending | null>(null);

  const close = useCallback((value: PromptResult | null) => {
    const current = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    setValues({});
    current?.resolve(value);
  }, []);

  const prompt = useCallback<PromptFn>((options) => {
    return new Promise<PromptResult | null>((resolve) => {
      if (pendingRef.current) {
        pendingRef.current.resolve(null);
      }
      const next = { options, resolve };
      pendingRef.current = next;
      setValues(initialValues(options));
      setPending(next);
    });
  }, []);

  const value = useMemo(() => prompt, [prompt]);
  const open = pending !== null;
  const opts = pending?.options;
  const fields = opts?.fields ?? [];

  const typeOk =
    !opts?.typeToConfirm || values.__typeToConfirm === opts.typeToConfirm;
  const requiredOk = fields.every(
    (field) => !field.required || (values[field.name]?.trim() ?? '') !== ''
  );
  const canSubmit = typeOk && requiredOk;

  useEffect(() => {
    if (!open) return;
    const first = document.querySelector<HTMLInputElement>('[data-prompt-field]');
    first?.focus();
    first?.select();
  }, [open]);

  const submit = () => {
    if (!canSubmit || !opts) return;
    const result: PromptResult = {};
    for (const field of fields) {
      result[field.name] = (values[field.name] ?? '').trim();
    }
    close(result);
  };

  return (
    <PromptDialogContext.Provider value={value}>
      {children}
      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          if (!next) close(null);
        }}
      >
        <AlertDialogContent
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canSubmit) {
              e.preventDefault();
              submit();
            }
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>{opts?.title ?? t('actions.confirm')}</AlertDialogTitle>
            {opts?.description ? (
              <AlertDialogDescription className="whitespace-pre-line">
                {opts.description}
              </AlertDialogDescription>
            ) : (
              <AlertDialogDescription className="sr-only">
                Formulaire de saisie
              </AlertDialogDescription>
            )}
          </AlertDialogHeader>

          <div className="grid gap-3 py-1">
            {fields.map((field) => (
              <div key={field.name} className="space-y-1.5">
                <Label htmlFor={`prompt-${field.name}`}>
                  {field.label}
                  {field.required ? ' *' : ''}
                </Label>
                {field.type === 'select' && field.options ? (
                  <Select
                    value={values[field.name] || undefined}
                    onValueChange={(v) =>
                      setValues((prev) => ({ ...prev, [field.name]: v }))
                    }
                  >
                    <SelectTrigger id={`prompt-${field.name}`} data-prompt-field>
                      <SelectValue placeholder={field.placeholder || field.label} />
                    </SelectTrigger>
                    <SelectContent>
                      {field.options.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id={`prompt-${field.name}`}
                    data-prompt-field
                    type={field.type === 'number' ? 'number' : 'text'}
                    value={values[field.name] ?? ''}
                    placeholder={field.placeholder}
                    onChange={(e) =>
                      setValues((prev) => ({ ...prev, [field.name]: e.target.value }))
                    }
                  />
                )}
              </div>
            ))}

            {opts?.typeToConfirm ? (
              <div className="space-y-1.5">
                <Label htmlFor="prompt-type-to-confirm">
                  {opts.typeToConfirmLabel ??
                    `Tapez ${opts.typeToConfirm} pour confirmer`}
                </Label>
                <Input
                  id="prompt-type-to-confirm"
                  data-prompt-field={fields.length === 0 ? true : undefined}
                  value={values.__typeToConfirm ?? ''}
                  placeholder={opts.typeToConfirm}
                  autoComplete="off"
                  onChange={(e) =>
                    setValues((prev) => ({ ...prev, __typeToConfirm: e.target.value }))
                  }
                />
              </div>
            ) : null}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>{opts?.cancelLabel ?? t('actions.cancel')}</AlertDialogCancel>
            <Button
              type="button"
              variant={opts?.variant === 'destructive' ? 'destructive' : 'default'}
              disabled={!canSubmit}
              onClick={submit}
            >
              {opts?.confirmLabel ?? t('actions.confirm')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PromptDialogContext.Provider>
  );
}

export function usePromptDialog(): PromptFn {
  const ctx = useContext(PromptDialogContext);
  if (!ctx) {
    throw new Error('usePromptDialog doit être utilisé dans PromptDialogProvider');
  }
  return ctx;
}
