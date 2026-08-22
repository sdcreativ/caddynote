import { useState } from "react";
import { useTranslation } from 'react-i18next';
import { Key, ShieldCheck, Loader2, Copy, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot
} from "@/components/ui/input-otp";
import { useToast } from "@/hooks/use-toast";
import { apiClient, ApiError } from "@/lib/apiClient";

interface TwoFactorAuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  language?: string;
  /** Si true, la croix / Échap / « Plus tard » ferment la fenêtre. */
  dismissible?: boolean;
  /** Appelé une fois la MFA effectivement activée côté serveur (IAM-003). */
  onEnabled?: () => void;
}

export function TwoFactorAuthDialog({
  open,
  onOpenChange,
  dismissible = true,
  onEnabled,
}: TwoFactorAuthDialogProps) {
  const { t } = useTranslation('settings');
  const { t: tc } = useTranslation('common');
  const { toast } = useToast();
  const [step, setStep] = useState<"intro" | "verify" | "recovery" | "success">("intro");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [codesAcknowledged, setCodesAcknowledged] = useState(false);

  const handleSetup2FA = async () => {
    setLoading(true);
    try {
      const result = await apiClient.post<{ secret: string; otpAuthUri: string; qrCodeDataUrl: string }>(
        '/auth/mfa/setup'
      );
      setQrCodeDataUrl(result.qrCodeDataUrl);
      setSecret(result.secret);
      setStep("verify");
    } catch (error) {
      toast({
        variant: "destructive",
        title: t('mfa.setupError'),
        description: error instanceof ApiError ? error.message : undefined,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    setLoading(true);
    try {
      const result = await apiClient.post<{ success: boolean; backupCodes?: string[] }>(
        '/auth/mfa/confirm',
        { code }
      );
      const codes = result.backupCodes ?? [];
      setBackupCodes(codes);
      setStep(codes.length > 0 ? "recovery" : "success");
    } catch (error) {
      toast({
        variant: "destructive",
        title: t('mfa.toastError'),
        description: error instanceof ApiError ? error.message : t('mfa.toastErrorDesc'),
      });
      setCode("");
    } finally {
      setLoading(false);
    }
  };

  const resetLocalState = () => {
    setStep("intro");
    setCode("");
    setQrCodeDataUrl(null);
    setSecret(null);
    setBackupCodes([]);
    setCopied(false);
    setCodesAcknowledged(false);
  };

  const handleClose = () => {
    setTimeout(resetLocalState, 300);
    onOpenChange(false);
  };

  const handleDialogOpenChange = (next: boolean) => {
    if (!next) {
      // Pendant recovery : ne pas fermer sans avoir vu les codes (même si dismissible).
      if (step === "recovery" && !codesAcknowledged) return;
      if (!dismissible && step !== "success") return;
      handleClose();
    }
  };

  const handleCopyCodes = async () => {
    try {
      await navigator.clipboard.writeText(backupCodes.join('\n'));
      setCopied(true);
      toast({ title: t('mfa.codesCopied') });
    } catch {
      toast({ variant: "destructive", title: t('mfa.codesCopyError') });
    }
  };

  const handleAcknowledgeCodes = () => {
    setCodesAcknowledged(true);
    setStep("success");
  };

  const handleSuccess = () => {
    toast({
      title: t('mfa.toastSuccess'),
      description: t('mfa.toastDesc'),
    });
    onEnabled?.();
    handleClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        onPointerDownOutside={(e) => {
          if (!dismissible || (step === "recovery" && !codesAcknowledged)) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (!dismissible || (step === "recovery" && !codesAcknowledged)) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            {t('mfa.title')}
          </DialogTitle>
          <DialogDescription>
            {step === "intro" && t('mfa.introDesc')}
            {step === "verify" && t('mfa.verifyDesc')}
            {step === "recovery" && t('mfa.recoveryDesc')}
            {step === "success" && t('mfa.successDesc')}
          </DialogDescription>
        </DialogHeader>

        {step === "intro" && (
          <div className="flex flex-col space-y-4 py-4">
            <div className="flex items-center space-x-2 rounded-md border p-4">
              <Key className="h-10 w-10 text-gray-400" />
              <div>
                <p className="font-medium">{t('mfa.securityLayer')}</p>
                <p className="text-sm text-muted-foreground">
                  {t('mfa.newDeviceCode')}
                </p>
              </div>
            </div>
          </div>
        )}

        {step === "verify" && (
          <div className="flex flex-col items-center space-y-6 py-4">
            <div className="relative border border-gray-200 dark:border-gray-800 rounded-md p-4">
              {qrCodeDataUrl && (
                <img src={qrCodeDataUrl} alt={t('mfa.qrAlt')} className="w-48 h-48 mx-auto" />
              )}
              <p className="mt-3 text-center text-sm text-muted-foreground">
                {t('mfa.scanQR')}
              </p>
              {secret && (
                <p className="mt-1 text-center text-xs font-mono text-muted-foreground break-all">
                  {t('mfa.manualEntry')} {secret}
                </p>
              )}
            </div>

            <div>
              <div className="mb-2 text-sm font-medium">{t('mfa.verificationCode')}</div>
              <InputOTP maxLength={6} value={code} onChange={setCode}>
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
          </div>
        )}

        {step === "recovery" && (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">{t('mfa.recoveryHint')}</p>
            <ul className="grid grid-cols-2 gap-2 rounded-md border bg-muted/40 p-3 font-mono text-sm">
              {backupCodes.map((c) => (
                <li key={c} className="text-center tracking-wide">
                  {c}
                </li>
              ))}
            </ul>
            <Button type="button" variant="outline" className="w-full" onClick={handleCopyCodes}>
              {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
              {copied ? t('mfa.codesCopied') : t('mfa.copyCodes')}
            </Button>
          </div>
        )}

        {step === "success" && (
          <div className="flex flex-col items-center justify-center py-6 space-y-4">
            <div className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
              <ShieldCheck className="h-10 w-10 text-green-600 dark:text-green-400" />
            </div>
            <p>{t('mfa.success')}</p>
          </div>
        )}

        <DialogFooter>
          {step === "intro" && (
            <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              {dismissible && (
                <Button variant="outline" onClick={handleClose} disabled={loading}>
                  {t('mfa.later')}
                </Button>
              )}
              <Button onClick={handleSetup2FA} disabled={loading} className="w-full sm:w-auto">
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('mfa.configure')}
              </Button>
            </div>
          )}

          {step === "verify" && (
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-between">
              <Button variant="outline" onClick={() => setStep("intro")} disabled={loading}>
                {tc('actions.back')}
              </Button>
              <Button onClick={handleVerifyCode} disabled={code.length !== 6 || loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('mfa.verify')}
              </Button>
            </div>
          )}

          {step === "recovery" && (
            <Button onClick={handleAcknowledgeCodes} className="w-full sm:w-auto">
              {t('mfa.codesSaved')}
            </Button>
          )}

          {step === "success" && (
            <Button onClick={handleSuccess} className="w-full sm:w-auto">
              {t('mfa.finish')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
