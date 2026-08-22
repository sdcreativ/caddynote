import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PublicShell } from '@/components/public/PublicShell';
import { CaddyNoteMark } from '@/components/brand/CaddyNoteLogo';
import { useToast } from '@/hooks/use-toast';
import { apiClient, ApiError } from '@/lib/apiClient';
import { useTranslation } from 'react-i18next';

const ForgotPasswordPage = () => {
  const { t } = useTranslation('auth');
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await apiClient.post('/auth/forgot-password', { email }, { skipAuth: true });
      setSent(true);
      toast({ title: t('forgot.successTitle'), description: t('forgot.successBody') });
    } catch (error) {
      toast({
        title: t('forgot.errorTitle'),
        description: error instanceof ApiError ? error.message : t('forgot.errorBody'),
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
            <div className="mb-3 flex justify-center">
              <CaddyNoteMark size={40} />
            </div>
            <CardTitle>{t('forgot.title')}</CardTitle>
            <CardDescription>{t('forgot.description')}</CardDescription>
          </CardHeader>
          <CardContent>
            {sent ? (
              <p className="text-sm text-slate-600">{t('forgot.successBody')}</p>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">{t('forgot.email')}</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? t('common:actions.loading') : t('forgot.submit')}
                </Button>
              </form>
            )}
            <p className="mt-4 text-sm">
              <Link to="/sign" className="text-primary underline">
                {t('forgot.backToLogin')}
              </Link>
            </p>
          </CardContent>
        </Card>
      </main>
    </PublicShell>
  );
};

export default ForgotPasswordPage;
