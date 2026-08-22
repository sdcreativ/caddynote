import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { FileCheck2, FileX2, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PublicShell } from '@/components/public/PublicShell';
import { Badge } from '@/components/ui/badge';

type VerifyPayload = {
  valid: boolean;
  status?: string;
  type?: string;
  title?: string;
  version?: number;
  institution?: string;
  generatedAt?: string;
  revokedAt?: string | null;
};

/**
 * DOC-004 — page publique (sans compte) pour scanner le QR d’un document.
 * L’API `GET /documents/verify/:token` reste la source de vérité (JSON) ;
 * le QR du PDF pointe ici via APP_URL.
 */
const DocumentVerifyPage = () => {
  const { token } = useParams<{ token: string }>();
  const { t } = useTranslation('documents');
  const [data, setData] = useState<VerifyPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setError(t('verify.missingToken'));
      setLoading(false);
      return;
    }
    const base = import.meta.env.VITE_API_URL || 'http://localhost:4000';
    void fetch(`${base}/documents/verify/${encodeURIComponent(token)}`)
      .then(async (r) => {
        const body = (await r.json().catch(() => null)) as VerifyPayload | null;
        if (!body) throw new Error(t('verify.loadError'));
        setData(body);
      })
      .catch((e) => setError(e instanceof Error ? e.message : t('verify.loadError')))
      .finally(() => setLoading(false));
  }, [token, t]);

  const typeLabel = data?.type ? t(`types.${data.type}`, { defaultValue: data.type }) : null;

  return (
    <PublicShell>
      <main className="relative isolate mx-auto max-w-lg flex-1 px-4 py-16 sm:px-6">
        <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
          <div className="absolute -left-16 top-8 h-64 w-64 rounded-full bg-[#1D70D8]/10 blur-3xl" />
          <div className="absolute right-0 top-32 h-48 w-48 rounded-full bg-sky-200/30 blur-3xl" />
        </div>

        <div className="flex items-center gap-3">
          <ShieldCheck className="h-8 w-8 text-[#1D70D8]" aria-hidden />
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight text-[#0B1F3A]">
              {t('verify.title')}
            </h1>
            <p className="text-sm text-slate-600">{t('verify.subtitle')}</p>
          </div>
        </div>

        {loading && <p className="mt-10 text-sm text-slate-500">{t('verify.loading')}</p>}
        {error && !loading && <p className="mt-10 text-sm text-destructive">{error}</p>}

        {data && !loading && (
          <section className="mt-10 space-y-4 rounded-2xl border border-slate-200/80 bg-white/80 p-6 backdrop-blur-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {data.valid ? (
                  <FileCheck2 className="h-5 w-5 text-emerald-600" aria-hidden />
                ) : (
                  <FileX2 className="h-5 w-5 text-destructive" aria-hidden />
                )}
                <p className="text-lg font-semibold text-[#0B1F3A]">
                  {data.valid ? t('verify.valid') : t('verify.invalid')}
                </p>
              </div>
              <Badge variant={data.valid ? 'default' : 'destructive'}>
                {data.status === 'revoked' ? t('statusRevoked') : data.valid ? t('statusValid') : data.status || '—'}
              </Badge>
            </div>

            <dl className="grid gap-3 text-sm">
              <div>
                <dt className="text-slate-500">{t('verify.institution')}</dt>
                <dd className="font-medium text-[#0B1F3A]">{data.institution || '—'}</dd>
              </div>
              <div>
                <dt className="text-slate-500">{t('verify.docType')}</dt>
                <dd className="font-medium text-[#0B1F3A]">{typeLabel || data.title || '—'}</dd>
              </div>
              {data.version != null && (
                <div>
                  <dt className="text-slate-500">{t('colVersion')}</dt>
                  <dd className="font-medium text-[#0B1F3A]">v{data.version}</dd>
                </div>
              )}
              {data.generatedAt && (
                <div>
                  <dt className="text-slate-500">{t('colGeneratedAt')}</dt>
                  <dd className="font-medium text-[#0B1F3A]">
                    {new Date(data.generatedAt).toLocaleString('fr-FR')}
                  </dd>
                </div>
              )}
              {data.revokedAt && (
                <div>
                  <dt className="text-slate-500">{t('verify.revokedAt')}</dt>
                  <dd className="font-medium text-[#0B1F3A]">
                    {new Date(data.revokedAt).toLocaleString('fr-FR')}
                  </dd>
                </div>
              )}
            </dl>
          </section>
        )}
      </main>
    </PublicShell>
  );
};

export default DocumentVerifyPage;
