
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Send } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useStrkUsers } from '@/hooks/useStrkUsers';
import { useStrkAuth } from '@/hooks/useStrkAuth';
import { useStrkSignatures } from '@/hooks/useStrkSignatures';
import { notifySignatureRequest } from '@/services/strkSignatureService';
import { ApiError } from '@/lib/apiClient';
import type { StrkSignatureType } from '@/types/strk';
import { useTranslation } from 'react-i18next';
import { tCommon } from '@/i18n/config';

interface SendSignatureRequestProps {
  onSuccess?: () => void;
}

const SendSignatureRequest = ({ onSuccess }: SendSignatureRequestProps) => {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<StrkSignatureType>('entry');
  const [studentId, setStudentId] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expiresAt, setExpiresAt] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const { toast } = useToast();
  const { t } = useTranslation('signatures');
  const { createSignature } = useStrkSignatures();
  const { user } = useStrkAuth();
  const { users, loadUsersByInstitution } = useStrkUsers();

  useEffect(() => {
    if (user?.institutionId) {
      loadUsersByInstitution(user.institutionId);
    }
  }, [user?.institutionId, loadUsersByInstitution]);

  const studentUsers = users.filter((u) => u.role === 'student');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !studentId || !date) {
      toast({
        title: t('send.fieldsRequiredTitle'),
        description: t('send.fieldsRequiredBody'),
        variant: 'destructive',
      });
      return;
    }
    if (!user?.institutionId) {
      toast({
        title: tCommon('status.error'),
        description: t('send.noInstitution'),
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      const created = await createSignature({
        title,
        type,
        student_id: studentId,
        institution_id: user.institutionId,
        date,
        sender_id: user.id,
        expires_at: expiresAt || undefined,
      });

      if (!created) {
        toast({
          title: tCommon('status.error'),
          description: t('send.createError'),
          variant: 'destructive',
        });
        return;
      }

      let mailNote = '';
      try {
        const mail = await notifySignatureRequest(studentId, title);
        mailNote = mail === 'sent'
          ? t('send.mailSent')
          : t('send.mailNotConfigured');
      } catch (error) {
        mailNote = error instanceof ApiError
          ? t('send.mailFailedWith', { message: error.message })
          : t('send.mailFailed');
      }

      toast({
        title: t('send.createdTitle'),
        description: t('send.createdBody', { title, mailNote }),
      });
      setTitle('');
      setType('entry');
      setStudentId('');
      setDate(new Date().toISOString().slice(0, 10));
      setExpiresAt('');
      onSuccess?.();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {!user?.institutionId && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
          <p className="text-yellow-700 text-sm">
            {t('send.noInstitutionHint')}
          </p>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="sig-title">{t('send.title')}</Label>
        <Input
          id="sig-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('send.titlePlaceholder')}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="sig-type">{t('send.type')}</Label>
          <Select value={type} onValueChange={(value: StrkSignatureType) => setType(value)}>
            <SelectTrigger id="sig-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="entry">{t('type.entry')}</SelectItem>
              <SelectItem value="exit">{t('type.exit')}</SelectItem>
              <SelectItem value="document">{t('type.document')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="sig-student">{t('send.student')}</Label>
          <Select value={studentId} onValueChange={setStudentId}>
            <SelectTrigger id="sig-student">
              <SelectValue placeholder={t('send.selectStudent')} />
            </SelectTrigger>
            <SelectContent>
              {studentUsers.length === 0 ? (
                <div className="p-2 text-sm text-muted-foreground">{t('send.noStudents')}</div>
              ) : (
                studentUsers.map((student) => (
                  <SelectItem key={student.id} value={student.id}>
                    {student.name} ({student.email})
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="sig-date">{t('send.date')}</Label>
          <Input id="sig-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sig-expires">{t('send.expires')}</Label>
          <Input
            id="sig-expires"
            type="datetime-local"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
          />
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={isLoading || !user?.institutionId}>
          {isLoading ? (
            t('send.creating')
          ) : (
            <>
              <Send className="mr-2 h-4 w-4" />
              {t('send.submit')}
            </>
          )}
        </Button>
      </div>
    </form>
  );
};

export default SendSignatureRequest;
