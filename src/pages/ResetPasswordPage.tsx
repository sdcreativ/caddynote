import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PublicShell } from '@/components/public/PublicShell';
import { useToast } from '@/hooks/use-toast';
import { apiClient, ApiError } from '@/lib/apiClient';
import { useTranslation } from 'react-i18next';
import { readResetPasswordToken, relocateResetTokenOutOfQuery } from '@/lib/resetPasswordToken';

const ResetPasswordPage = () => {
  const { t } = useTranslation('auth');
  const { toast } = useToast();
  const navigate = useNavigate();
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    relocateResetTokenOutOfQuery();
    setToken(readResetPasswordToken());
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      toast({ title: t('reset.missingToken'), variant: 'destructive' });
      return;
    }
    if (password !== confirm) {
      toast({ title: t('reset.mismatch'), variant: 'destructive' });
      return;
    }
    if (password.length < 8) {
      toast({ title: t('reset.tooShort'), variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      await apiClient.post('/auth/reset-password', { token, newPassword: password }, { skipAuth: true });
      toast({ title: t('reset.successTitle'), description: t('reset.successBody') });
      navigate('/sign');
    } catch (error) {
      toast({
        title: t('reset.errorTitle'),
        description: error instanceof ApiError ? error.message : t('reset.errorBody'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <PublicShell>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
        <Card className="border-slate-200 shadow-none">
          <CardHeader>
            <CardTitle>{t('reset.title')}</CardTitle>
            <CardDescription>{t('reset.description')}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">{t('reset.password')}</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">{t('reset.confirm')}</Label>
                <Input
                  id="confirm"
                  type="password"
                  required
                  minLength={8}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading || !token}>
                {loading ? t('common:actions.loading') : t('reset.submit')}
              </Button>
            </form>
            <p className="mt-4 text-sm">
              <Link to="/forgot-password" className="text-primary underline">
                {t('reset.requestAgain')}
              </Link>
            </p>
          </CardContent>
        </Card>
      </main>
    </PublicShell>
  );
};

export default ResetPasswordPage;
