import { useState, useEffect } from "react";
import { useNavigate } from 'react-router-dom';
import { useStrkAuth } from '@/hooks/useStrkAuth';
import { useToast } from '@/hooks/use-toast';
import { Eye, EyeOff, Shield, Clock, AlertCircle, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

const MAX_ATTEMPTS = 3;
/** Déblocage automatique (blocage UI uniquement, pas serveur). */
const LOCKOUT_MS = 60_000;

export function AdminLoginForm() {
  const { t } = useTranslation('auth');
  const { toast } = useToast();
  const { login, verifyMfaCode, cancelMfaChallenge } = useStrkAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [attemptCount, setAttemptCount] = useState(0);
  const [lockUntil, setLockUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [mfaStep, setMfaStep] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const navigate = useNavigate();

  const isBlocked = lockUntil != null && now < lockUntil;
  const remainingSec = lockUntil != null ? Math.max(0, Math.ceil((lockUntil - now) / 1000)) : 0;

  useEffect(() => {
    if (!lockUntil) return;
    const id = window.setInterval(() => {
      const tnow = Date.now();
      setNow(tnow);
      if (tnow >= lockUntil) {
        setLockUntil(null);
        setAttemptCount(0);
      }
    }, 500);
    return () => window.clearInterval(id);
  }, [lockUntil]);

  const registerFailure = () => {
    setAttemptCount((prev) => {
      const next = prev + 1;
      if (next >= MAX_ATTEMPTS) {
        setLockUntil(Date.now() + LOCKOUT_MS);
      }
      return next;
    });
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isBlocked) {
      toast({
        title: t('admin.blockedTitle'),
        description: t('admin.blockedRetry', { seconds: remainingSec }),
        variant: "destructive",
      });
      return;
    }

    if (!email || !password) {
      toast({
        title: t('admin.missingTitle'),
        description: t('admin.missingBody'),
        variant: "destructive",
      });
      return;
    }

    if (!email.includes('@') || !email.includes('.')) {
      toast({
        title: t('admin.invalidEmailTitle'),
        description: t('admin.invalidEmailBody'),
        variant: "destructive",
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

      setAttemptCount(0);
      setLockUntil(null);
      toast({
        title: t('admin.successTitle'),
        description: t('admin.successBody'),
      });
      navigate('/super-admin');
    } catch (error: unknown) {
      registerFailure();
      console.warn(`[SECURITY] Admin login attempt failed: ${email} at ${new Date().toISOString()}`);
      const message = error instanceof Error ? error.message : t('admin.failedBody');
      toast({
        title: t('admin.failedTitle'),
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyMfa = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = mfaCode.trim();
    if (useRecoveryCode) {
      if (trimmed.replace(/[\s-]/g, "").length < 8) return;
    } else if (trimmed.length !== 6) {
      return;
    }

    setIsLoading(true);
    try {
      await verifyMfaCode(trimmed);
      setAttemptCount(0);
      setLockUntil(null);
      toast({ title: t('admin.successTitle'), description: t('admin.successBody') });
      navigate('/super-admin');
    } catch (error: unknown) {
      registerFailure();
      const message = error instanceof Error ? error.message : t('login.mfaInvalid');
      toast({
        title: t('login.mfaInvalidTitle'),
        description: message,
        variant: "destructive",
      });
      setMfaCode("");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelMfa = () => {
    cancelMfaChallenge();
    setMfaStep(false);
    setMfaCode("");
    setUseRecoveryCode(false);
  };

  if (mfaStep) {
    const recoveryNormalized = mfaCode.replace(/[\s-]/g, "");
    const canSubmit = useRecoveryCode
      ? recoveryNormalized.length >= 8
      : mfaCode.length === 6;

    return (
      <form onSubmit={handleVerifyMfa} className="space-y-6">
        <div className="flex flex-col items-center text-center space-y-2">
          <ShieldCheck className="h-10 w-10 text-red-500" />
          <h3 className="text-lg font-semibold text-white">{t('login.mfaTitle')}</h3>
          <p className="text-sm text-slate-400">
            {useRecoveryCode ? t('login.mfaRecoveryDescription') : t('login.mfaDescription')}
          </p>
        </div>

        {useRecoveryCode ? (
          <div className="space-y-2">
            <Label htmlFor="admin-mfa-recovery" className="text-slate-300">
              {t('login.mfaRecoveryLabel')}
            </Label>
            <Input
              id="admin-mfa-recovery"
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value.toUpperCase())}
              placeholder={t('login.mfaRecoveryPlaceholder')}
              autoComplete="one-time-code"
              className="font-mono tracking-wider bg-slate-900 border-slate-700 text-white"
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
          <Button type="submit" className="w-full bg-red-600 hover:bg-red-700 text-white" disabled={!canSubmit || isLoading || isBlocked}>
            {isLoading ? t('login.mfaSubmitting') : t('login.mfaSubmit')}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="border-slate-600 text-slate-300 hover:text-white"
            onClick={() => {
              setUseRecoveryCode((v) => !v);
              setMfaCode("");
            }}
            disabled={isLoading}
          >
            {useRecoveryCode ? t('login.mfaUseApp') : t('login.mfaUseRecovery')}
          </Button>
          <Button type="button" variant="ghost" className="text-slate-400 hover:text-white" onClick={handleCancelMfa} disabled={isLoading}>
            {t('common:actions.back')}
          </Button>
        </div>
      </form>
    );
  }

  const attemptMessage = isBlocked
    ? t('admin.attemptBlockedRetry', { seconds: remainingSec })
    : attemptCount === 2
      ? t('admin.attempt2')
      : attemptCount === 1
        ? t('admin.attempt1')
        : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between text-sm">
        <Badge variant="outline" className="text-green-600 border-green-600">
          <Shield className="h-3 w-3 mr-1" />
          {t('admin.secureBadge')}
        </Badge>
        <div className="flex items-center text-slate-400">
          <Clock className="h-3 w-3 mr-1" />
          {t('admin.session', { hours: 8 })}
        </div>
      </div>

      {attemptMessage && (
        <Alert variant={attemptCount >= 2 || isBlocked ? "destructive" : "default"}>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{attemptMessage}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="admin-email" className="text-white">
            {t('admin.email')}
          </Label>
          <Input
            id="admin-email"
            type="email"
            placeholder="admin@caddynote.com"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isBlocked}
            className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-400 focus:border-red-500"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="admin-password" className="text-white">
            {t('admin.password')}
          </Label>
          <div className="relative">
            <Input
              id="admin-password"
              type={showPassword ? "text" : "password"}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isBlocked}
              className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-400 focus:border-red-500"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setShowPassword(!showPassword)}
              disabled={isBlocked}
              className="absolute right-0 top-0 h-full px-3 text-slate-400 hover:text-white"
              aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <Button
          type="submit"
          className="w-full bg-red-600 hover:bg-red-700 text-white font-medium"
          disabled={isLoading || isBlocked}
        >
          {isLoading ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              {t('admin.submitting')}
            </>
          ) : (
            <>
              <Shield className="h-4 w-4 mr-2" />
              {t('admin.submit')}
            </>
          )}
        </Button>
      </form>

      <div className="border-t border-slate-700 pt-4">
        <div className="text-xs text-slate-400 space-y-1">
          <p>• {t('admin.infoSecure')}</p>
          <p>• {t('admin.infoLimited')}</p>
          <p>• {t('admin.infoAudit')}</p>
        </div>
      </div>
    </div>
  );
}

export default AdminLoginForm;
