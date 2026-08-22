
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, Clock } from 'lucide-react';
import SignatureCanvas from '@/components/signature/SignatureCanvas';
import { useToast } from '@/hooks/use-toast';
import { fetchStrkSignatureById, updateStrkSignatureStatus } from '@/services/strkSignatureService';
import { useStrkAuth } from '@/hooks/useStrkAuth';
import type { StrkSignature } from '@/types/strk';
import { useTranslation } from 'react-i18next';
import { tCommon } from '@/i18n/config';

const SignaturePage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useTranslation('signatures');
  const { user } = useStrkAuth();

  const [signature, setSignature] = useState<StrkSignature | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);

  useEffect(() => {
    if (!id) {
      setLoadError(t('page.invalidLink'));
      return;
    }
    let cancelled = false;
    (async () => {
      const data = await fetchStrkSignatureById(id);
      if (cancelled) return;
      if (!data) {
        setLoadError(t('page.notFound'));
        return;
      }
      if (data.status === 'completed') {
        setSignature(data);
        setIsCompleted(true);
        return;
      }
      if (data.status === 'expired') {
        setLoadError(t('page.expired'));
        return;
      }
      setSignature(data);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleSaveSignature = (data: string) => {
    setSignatureData(data);
    toast({
      title: t('page.capturedTitle'),
      description: t('page.capturedBody'),
    });
  };

  const handleSubmit = async () => {
    if (!signature || !signatureData) {
      toast({
        title: tCommon('status.error'),
        description: t('page.signBeforeSubmit'),
        variant: 'destructive',
      });
      return;
    }
    if (user?.role === 'student' && user.id !== signature.student_id) {
      toast({
        title: t('page.accessDeniedTitle'),
        description: t('page.accessDeniedBody'),
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const updated = await updateStrkSignatureStatus(signature.id, 'completed', signatureData);
      if (!updated) {
        throw new Error('update failed');
      }
      toast({
        title: t('page.savedTitle'),
        description: t('page.savedBody'),
      });
      setIsCompleted(true);
    } catch {
      toast({
        title: tCommon('status.error'),
        description: t('page.saveError'),
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loadError) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-muted/40 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>{t('page.unavailable')}</CardTitle>
            <CardDescription>{loadError}</CardDescription>
          </CardHeader>
          <CardFooter>
            <Button onClick={() => navigate('/signatures')} className="w-full">
              {t('page.back')}
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (!signature) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">{t('page.loading')}</p>
      </div>
    );
  }

  if (isCompleted) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-muted/40 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
            <CardTitle>{t('page.completed')}</CardTitle>
            <CardDescription>{signature.title}</CardDescription>
          </CardHeader>
          <CardFooter className="flex justify-center">
            <Button onClick={() => navigate('/signatures')}>{t('page.back')}</Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  const typeLabel = signature.type === 'entry' ? t('page.typeEntry') : signature.type === 'exit' ? t('page.typeExit') : t('page.typeDocument');

  return (
    <div className="flex items-center justify-center min-h-screen bg-muted/40 p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="text-center">{signature.title}</CardTitle>
          <CardDescription className="text-center">
            {t('page.ofType', { type: typeLabel })}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="border rounded-md p-3 bg-muted/50 flex items-center">
            <Clock className="h-5 w-5 text-muted-foreground mr-2" />
            <span className="text-sm">
              {new Date(signature.date).toLocaleDateString('fr-FR')}
              {signature.expires_at && t('page.expiresOn', { date: new Date(signature.expires_at).toLocaleString('fr-FR') })}
            </span>
          </div>
          <SignatureCanvas onSave={handleSaveSignature} width={500} height={200} />
          {signatureData && (
            <div className="flex justify-center items-center text-sm text-green-600">
              <CheckCircle className="mr-1 h-4 w-4" />
              {t('page.captured')}
            </div>
          )}
        </CardContent>
        <CardFooter>
          <Button
            onClick={handleSubmit}
            className="w-full"
            disabled={!signatureData || isSubmitting}
          >
            {isSubmitting ? t('page.saving') : t('page.saveMine')}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

export default SignaturePage;
