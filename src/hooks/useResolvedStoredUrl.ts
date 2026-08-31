import { useEffect, useState } from 'react';
import { resolveStoredFileDisplayUrl } from '@/lib/storedFileAccess';

const isDirectUrl = (key: string) =>
  key.startsWith('http') ||
  key.startsWith('blob:') ||
  key.startsWith('/') ||
  key.startsWith('data:');

/**
 * Résout une clé stockage (ou URL directe) en URL affichable pour `<img src>`.
 * Révoque les blob: au démontage / changement de clé.
 */
export function useResolvedStoredUrl(key: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    const run = async () => {
      if (!key) {
        setUrl(null);
        return;
      }
      if (isDirectUrl(key)) {
        setUrl(key);
        return;
      }
      try {
        const resolved = await resolveStoredFileDisplayUrl(key);
        if (cancelled) {
          if (resolved.startsWith('blob:')) URL.revokeObjectURL(resolved);
          return;
        }
        objectUrl = resolved.startsWith('blob:') ? resolved : null;
        setUrl(resolved);
      } catch {
        if (!cancelled) setUrl(null);
      }
    };

    void run();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [key]);

  return url;
}
