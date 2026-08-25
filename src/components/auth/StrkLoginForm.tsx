import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useStrkAuth } from '@/hooks/useStrkAuth';
import { useToast } from '@/hooks/use-toast';
import { Eye, EyeOff, Mail, AlertTriangle, RefreshCw, ShieldCheck } from 'lucide-react';
import { apiClient } from '@/lib/apiClient';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

const BLUE = '#1D70D8';
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';

const fieldClass =
  'h-11 rounded-xl border-slate-200/90 bg-slate-50/80 shadow-none transition placeholder:text-slate-400 focus-visible:border-[#1D70D8]/50 focus-visible:bg-white focus-visible:ring-[#1D70D8]/25';

type StrkLoginFormProps = {
  embedded?: boolean;
};

type SsoPublic = {
  enabled: boolean;
  institutionId?: string;
  provider?: string;
  displayName?: string;
};

export function StrkLoginForm({ embedded = false }: StrkLoginFormProps) {
  const { t } = useTranslation('auth');
  const { toast } = useToast();
  const {
    login,
    verifyMfaCode,
    cancelMfaChallenge,
    acceptSsoToken,
    beginSsoMfaChallenge,
    user,
    isLoading: authLoading,
    authError,
  } = useStrkAuth();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [redirectionError] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [mfaStep, setMfaStep] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [sso, setSso] = useState<SsoPublic>({ enabled: false });
  const [ssoLoading, setSsoLoading] = useState(false);
  const ssoHandled = useRef(false);

  const institutionFromQuery = searchParams.get('institutionId') || searchParams.get('institution') || '';

  const cardClass = cn(
    'space-y-6',
    !embedded &&
      'rounded-[1.5rem] border border-slate-200/80 bg-white p-6 shadow-[0_24px_60px_-36px_rgba(15,23,42,0.35)] sm:p-8'
  );

  const handleManualRedirect = useCallback(() => {
    const dest = '/dashboard';
    window.location.href = dest;
    setTimeout(() => {
      if (window.location.pathname !== dest) {
        navigate(dest, { replace: true });
      }
    }, 1000);
  }, [navigate, user?.role]);

  // Callback SSO : fragment #sso_token= / #sso_mfa= / #sso_error=
  useEffect(() => {
    if (ssoHandled.current || typeof window === 'undefined') return;
    const hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    const params = new URLSearchParams(hash);
    const token = params.get('sso_token');
    const mfa = params.get('sso_mfa');
    const err = params.get('sso_error');
    if (!token && !mfa && !err) return;
    ssoHandled.current = true;
    window.history.replaceState(null, '', window.location.pathname + window.location.search);

    if (err) {
      toast({
        title: t('login.failedTitle'),
        description: t('login.ssoError', { code: err }),
        variant: 'destructive',
      });
      return;
    }
    if (mfa) {
      beginSsoMfaChallenge(mfa);
      setMfaStep(true);
      toast({ title: t('login.mfaTitle'), description: t('login.mfaDescription') });
      return;
    }
    if (token) {
      setIsLoading(true);
      acceptSsoToken(token)
        .then(() => {
          toast({ title: t('login.successTitle'), description: t('login.redirecting') });
          setTimeout(handleManualRedirect, 400);
        })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : t('login.invalidCredentials');
          toast({ title: t('login.failedTitle'), description: message, variant: 'destructive' });
        })
        .finally(() => setIsLoading(false));
    }
  }, [acceptSsoToken, beginSsoMfaChallenge, handleManualRedirect, t, toast]);

  // Config SSO via ?institutionId= ou découverte par domaine e-mail
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        if (institutionFromQuery) {
          setSsoLoading(true);
          const cfg = await apiClient.get<SsoPublic>(
            `/auth/sso/public-config?institutionId=${encodeURIComponent(institutionFromQuery)}`,
            { skipAuth: true }
          );
          if (!cancelled) setSso(cfg);
          return;
        }
        const trimmed = email.trim().toLowerCase();
        if (!trimmed.includes('@') || trimmed.length < 5) {
          if (!cancelled) setSso({ enabled: false });
          return;
        }
        setSsoLoading(true);
        const cfg = await apiClient.get<SsoPublic>(
          `/auth/sso/discover?email=${encodeURIComponent(trimmed)}`,
          { skipAuth: true }
        );
        if (!cancelled) setSso(cfg);
      } catch {
        if (!cancelled) setSso({ enabled: false });
      } finally {
        if (!cancelled) setSsoLoading(false);
      }
    };
    const timer = window.setTimeout(run, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [email, institutionFromQuery]);

  useEffect(() => {
    if (user && !authLoading) {
      const redirectTimer = setTimeout(() => {
        handleManualRedirect();
      }, 300);
      return () => clearTimeout(redirectTimer);
    }
  }, [user, authLoading, handleManualRedirect]);

  useEffect(() => {
    if (authLoading) {
      setLoadingMessage(t('login.loadingProfile'));
    } else if (user && !redirectionError) {
      setLoadingMessage(t('login.redirectingDashboard'));
    }
  }, [authLoading, user, redirectionError, t]);

  const startSso = () => {
    const institutionId = sso.institutionId || institutionFromQuery;
    if (!institutionId) return;
    const qs = new URLSearchParams({ institutionId });
    if (email.includes('@')) qs.set('email', email.trim().toLowerCase());
    window.location.href = `${API_BASE.replace(/\/$/, '')}/auth/sso/start?${qs.toString()}`;
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!email || !password) {
      toast({
        title: t('login.errorTitle'),
        description: t('login.fieldsRequired'),
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);

    try {
      const { mfaRequired } = await login(email, password);
      if (mfaRequired) {
        setMfaStep(true);
        setIsLoading(false);
        return;
      }

      toast({
        title: t('login.successTitle'),
        description: t('login.redirecting'),
      });

      setTimeout(() => {
        handleManualRedirect();
      }, 500);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t('login.invalidCredentials');
      toast({
        title: t('login.failedTitle'),
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyMfa = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = mfaCode.trim();
    if (useRecoveryCode) {
      if (trimmed.replace(/[\s-]/g, '').length < 8) return;
    } else if (trimmed.length !== 6) {
      return;
    }

    setIsLoading(true);
    try {
      await verifyMfaCode(trimmed);
      toast({ title: t('login.successTitle'), description: t('login.redirecting') });
      setTimeout(handleManualRedirect, 500);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t('login.mfaInvalid');
      toast({
        title: t('login.mfaInvalidTitle'),
        description: message,
        variant: 'destructive',
      });
      setMfaCode('');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelMfa = () => {
    cancelMfaChallenge();
    setMfaStep(false);
    setMfaCode('');
    setUseRecoveryCode(false);
  };

  if (mfaStep) {
    const recoveryNormalized = mfaCode.replace(/[\s-]/g, '');
    const canSubmit = useRecoveryCode
      ? recoveryNormalized.length >= 8
      : mfaCode.length === 6;

    return (
      <form onSubmit={handleVerifyMfa} className={cardClass}>
        <div className="flex flex-col items-center space-y-2 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#E8F1FF] text-[#1D70D8]">
            <ShieldCheck className="h-6 w-6" aria-hidden />
          </span>
          <h3 className="text-lg font-bold text-[#0B1F3A]">{t('login.mfaTitle')}</h3>
          <p className="text-sm text-slate-500">
            {useRecoveryCode ? t('login.mfaRecoveryDescription') : t('login.mfaDescription')}
          </p>
        </div>

        {useRecoveryCode ? (
          <div className="space-y-2">
            <Label htmlFor="mfa-recovery" className="text-sm font-semibold text-[#0B1F3A]">
              {t('login.mfaRecoveryLabel')}
            </Label>
            <Input
              id="mfa-recovery"
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value.toUpperCase())}
              placeholder={t('login.mfaRecoveryPlaceholder')}
              autoComplete="one-time-code"
              className={cn(fieldClass, 'font-mono tracking-wider')}
              maxLength={19}
            />
          </div>
        ) : (
          <div className="flex justify-center">
            <InputOTP maxLength={6} value={mfaCode} onChange={setMfaCode}>
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <Button
            type="submit"
            className="h-12 w-full rounded-full font-semibold text-white"
            style={{ backgroundColor: BLUE }}
            disabled={!canSubmit || isLoading}
          >
            {isLoading ? t('login.mfaSubmitting') : t('login.mfaSubmit')}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setUseRecoveryCode((v) => !v);
              setMfaCode('');
            }}
            disabled={isLoading}
          >
            {useRecoveryCode ? t('login.mfaUseApp') : t('login.mfaUseRecovery')}
          </Button>
          <Button type="button" variant="ghost" onClick={handleCancelMfa} disabled={isLoading}>
            {t('common:actions.back')}
          </Button>
        </div>
      </form>
    );
  }

  if (user && !authLoading) {
    return (
      <div className={cardClass}>
        <div className="space-y-4 text-center">
          <RefreshCw className="mx-auto h-8 w-8 animate-spin text-[#1D70D8]" aria-hidden />
          <div>
            <h3 className="text-lg font-bold text-[#0B1F3A]">{t('login.successTitle')}</h3>
            <p className="mt-2 text-slate-500">{loadingMessage || t('login.redirecting')}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={cn('space-y-5', !embedded && cardClass)}>
      {authError && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden />
          <div>
            <h4 className="font-semibold text-red-800">{t('login.authErrorTitle')}</h4>
            <p className="mt-1 text-sm text-red-700">{authError}</p>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="email" className="text-sm font-semibold text-[#0B1F3A]">
          {t('login.email')}
        </Label>
        <div className="relative">
          <Mail
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#1D70D8]/70"
            aria-hidden
          />
          <Input
            id="email"
            type="email"
            placeholder={t('login.emailPlaceholder')}
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={cn(fieldClass, 'pl-10')}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="password" className="text-sm font-semibold text-[#0B1F3A]">
          {t('login.password')}
        </Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? 'text' : 'password'}
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={cn(fieldClass, 'pr-10')}
            placeholder="••••••••"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-0 top-0 h-full px-3 text-slate-400 hover:text-slate-600"
            aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between text-sm">
        <label htmlFor="remember-me" className="flex cursor-pointer items-center gap-2">
          <input
            id="remember-me"
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 text-[#1D70D8] focus:ring-[#1D70D8]"
          />
          <span className="text-slate-600">{t('login.rememberMe')}</span>
        </label>
        <Link to="/forgot-password" className="font-semibold text-[#1D70D8] hover:underline">
          {t('login.forgot')}
        </Link>
      </div>

      {sso.enabled && (
        <div className="space-y-3">
          <Button
            type="button"
            variant="outline"
            className="h-12 w-full rounded-full border-slate-300 text-sm font-semibold text-[#0B1F3A]"
            onClick={startSso}
            disabled={ssoLoading || isLoading}
          >
            {t('login.ssoContinue', { provider: sso.displayName || 'Microsoft' })}
          </Button>
          <div className="relative py-1 text-center text-xs uppercase tracking-wide text-slate-400">
            <span className="bg-white px-2 relative z-10">{t('login.ssoOr')}</span>
            <span className="absolute inset-x-0 top-1/2 border-t border-slate-200" aria-hidden />
          </div>
        </div>
      )}

      <Button
        type="submit"
        className="h-12 w-full rounded-full text-sm font-semibold text-white shadow-[0_12px_28px_-10px_rgba(29,112,216,0.75)] transition-all duration-200 hover:brightness-95 hover:shadow-[0_16px_32px_-10px_rgba(29,112,216,0.85)]"
        style={{ backgroundColor: BLUE }}
        disabled={isLoading}
      >
        {isLoading ? t('login.submitting') : t('login.submit')}
      </Button>

      <p className="text-center text-sm text-slate-500">
        {t('login.noAccount')}{' '}
        <Link to="/signup" className="font-semibold text-[#1D70D8] hover:underline">
          {t('login.signup')}
        </Link>
      </p>
    </form>
  );
}
