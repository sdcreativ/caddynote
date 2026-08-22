import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { 
  Dialog, 
  DialogContent, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useStrkUsers } from '@/hooks/useStrkUsers';
import { useStrkInstitutions } from '@/hooks/useStrkInstitutions';
import { useStrkClasses } from '@/hooks/useStrkClasses';
import { apiClient } from '@/lib/apiClient';
import { assignTeacherToClass } from '@/services/strkClassService';
import { CreateClassDialog } from './CreateClassDialog';
import { ExternalLink, Plus } from 'lucide-react';

interface CreateUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUserCreated?: () => void;
  defaultRole?: string;
}

const CreateUserDialog = ({ open, onOpenChange, onUserCreated, defaultRole = 'student' }: CreateUserDialogProps) => {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    role: defaultRole,
    institutionId: '',
    phoneNumber: '',
    classId: '__none__'
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCreateClassDialog, setShowCreateClassDialog] = useState(false);
  
  const { toast } = useToast();
  const { t } = useTranslation('users');
  const { t: tc } = useTranslation('common');
  const { institutions } = useStrkInstitutions();
  const { classes, loadClassesByInstitution } = useStrkClasses();

  // Load classes when institution changes for teachers
  useEffect(() => {
    if (formData.role === 'teacher' && formData.institutionId) {
      loadClassesByInstitution(formData.institutionId);
    }
  }, [formData.role, formData.institutionId, loadClassesByInstitution]);

  const handleClassCreated = () => {
    // Rafraîchir la liste des classes après création
    if (formData.institutionId && formData.role === 'teacher') {
      loadClassesByInstitution(formData.institutionId);
    }
    setShowCreateClassDialog(false);
  };

  const handleSubmit = async () => {
    if (!formData.firstName || !formData.lastName || !formData.email) {
      toast({
        title: tc('status.error'),
        description: t('createDialog.required'),
        variant: "destructive"
      });
      return;
    }

    if (!formData.email.includes('@')) {
      toast({
        title: tc('status.error'),
        description: t('createDialog.invalidEmail'),
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const { user, tempPassword, emailSent, smsSent } = await apiClient.post<{
        user: { id: string };
        tempPassword: string;
        emailSent?: boolean;
        smsSent?: boolean;
      }>('/users', {
        email: formData.email,
        firstName: formData.firstName,
        lastName: formData.lastName,
        role: formData.role,
        institutionId: formData.institutionId || undefined,
        phoneNumber: formData.phoneNumber || undefined,
      });

      // Si c'est un enseignant et qu'une classe est sélectionnée, l'assigner
      if (formData.role === 'teacher' && formData.classId && formData.classId !== '__none__') {
        try {
          await assignTeacherToClass(formData.classId, user.id);
        } catch (error) {
          console.error('Error assigning teacher to class:', error);
          // On continue même si l'assignation échoue
        }
      }

      toast({
        title: t('createDialog.createdTitle'),
        description: [
          t('createDialog.createdAccount', { email: formData.email, password: tempPassword }),
          emailSent ? t('createDialog.emailSent') : t('createDialog.emailNotSent'),
          formData.phoneNumber
            ? (smsSent ? t('createDialog.smsSent') : t('createDialog.smsNotSent'))
            : null,
        ].filter(Boolean).join(' '),
      });

      // Reset form
      setFormData({
        firstName: '',
        lastName: '',
        email: '',
        role: defaultRole,
        institutionId: '',
        phoneNumber: '',
        classId: '__none__'
      });

      onUserCreated?.();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Erreur lors de la création de l\'utilisateur:', error);
      toast({
        title: tc('status.error'),
        description: error.message || t('createDialog.errorBody'),
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t('createDialog.title')}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {t('createDialog.description')}
          </p>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">{t('createDialog.firstName')}</Label>
              <Input 
                id="firstName" 
                placeholder={t('fields.firstNamePlaceholder')} 
                value={formData.firstName}
                onChange={(e) => setFormData({...formData, firstName: e.target.value})}
                className="h-9"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="lastName">{t('createDialog.lastName')}</Label>
              <Input 
                id="lastName" 
                placeholder={t('fields.lastNamePlaceholder')} 
                value={formData.lastName}
                onChange={(e) => setFormData({...formData, lastName: e.target.value})}
                className="h-9"
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="email">{t('createDialog.email')}</Label>
            <Input 
              id="email" 
              type="email"
              placeholder={t('fields.emailPlaceholderAdd')} 
              value={formData.email}
              onChange={(e) => setFormData({...formData, email: e.target.value})}
              className="h-9"
            />
          </div>
          
          
          <div className="space-y-2">
            <Label htmlFor="role">{t('createDialog.role')}</Label>
            <Select 
              value={formData.role} 
              onValueChange={(value) => setFormData({...formData, role: value})}
            >
              <SelectTrigger id="role" className="h-9">
                <SelectValue placeholder={t('createDialog.rolePlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="student">{t('createDialog.roles.student')}</SelectItem>
                <SelectItem value="parent">{t('createDialog.roles.parent')}</SelectItem>
                <SelectItem value="teacher">{t('createDialog.roles.teacher')}</SelectItem>
                <SelectItem value="head_teacher">{t('createDialog.roles.head_teacher')}</SelectItem>
                <SelectItem value="supervisor">{t('createDialog.roles.supervisor')}</SelectItem>
                <SelectItem value="secretary">{t('createDialog.roles.secretary')}</SelectItem>
                <SelectItem value="accountant">{t('createDialog.roles.accountant')}</SelectItem>
                <SelectItem value="school_admin">{t('createDialog.roles.school_admin')}</SelectItem>
                <SelectItem value="admin">{t('createDialog.roles.admin')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="institution">{t('createDialog.institution')}</Label>
            <Select 
              value={formData.institutionId} 
              onValueChange={(value) => setFormData({...formData, institutionId: value})}
            >
              <SelectTrigger id="institution" className="h-9">
                <SelectValue placeholder={t('createDialog.institutionPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {institutions.map((institution) => (
                  <SelectItem key={institution.id} value={institution.id}>
                    {institution.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {formData.role === 'teacher' && formData.institutionId && (
            <div className="space-y-2">
              <Label htmlFor="class">{t('fields.classTeachOptional')}</Label>
              {classes.filter(cls => cls.institution_id === formData.institutionId).length > 0 ? (
                <Select 
                  value={formData.classId || '__none__'} 
                  onValueChange={(value) => setFormData({...formData, classId: value})}
                >
                  <SelectTrigger id="class" className="h-9">
                    <SelectValue placeholder={t('fields.classPlaceholderOptional')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{t('fields.noClass')}</SelectItem>
                    {classes.filter(cls => cls.institution_id === formData.institutionId).map((cls) => (
                      <SelectItem key={cls.id} value={cls.id}>
                        {cls.name} {cls.teacher_name && `(${cls.teacher_name})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                  <div className="space-y-3">
                    <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                      <div className="flex items-start space-x-2">
                        <div className="text-yellow-600 mt-0.5">⚠️</div>
                        <div className="text-sm text-yellow-800">
                          <p className="font-medium">{t('noClassesTitle')}</p>
                          <p className="mt-1">
                            {t('createDialog.noClassesTeacherBody')}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setShowCreateClassDialog(true)}
                        className="flex items-center gap-2"
                      >
                        <Plus className="h-4 w-4" />
                        {t('createClassNow')}
                      </Button>
                      <div className="text-sm text-muted-foreground flex items-center">
                        💡 <strong>{t('tipLabel')}</strong> {t('tipCreateClasses', { name: institutions.find(i => i.id === formData.institutionId)?.name || t('thisInstitution') })}
                      </div>
                    </div>
                  </div>
              )}
            </div>
          )}
          
          <div className="space-y-2">
            <Label htmlFor="phoneNumber">{t('createDialog.phone')}</Label>
            <Input 
              id="phoneNumber" 
              type="tel"
              placeholder={t('createDialog.phonePlaceholder')} 
              value={formData.phoneNumber}
              onChange={(e) => setFormData({...formData, phoneNumber: e.target.value})}
              className="h-9"
            />
          </div>
        </div>
        
        <div className="bg-blue-50 border border-blue-200 rounded-md p-3 mb-4">
          <div className="flex items-start space-x-2">
            <div className="text-blue-600 mt-0.5">ℹ️</div>
            <div className="text-sm text-blue-800">
              <p className="font-medium">{t('createDialog.infoTitle')}</p>
              <ul className="mt-1 space-y-1 text-xs">
                <li>• {t('createDialog.info1')}</li>
                <li>• {t('createDialog.info2')}</li>
                <li>• {t('createDialog.info3')}</li>
              </ul>
            </div>
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tc('actions.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? t('createDialog.submitting') : t('createDialog.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Dialog de création de classe */}
      <CreateClassDialog
        open={showCreateClassDialog}
        onOpenChange={setShowCreateClassDialog}
        institutionId={formData.institutionId}
        onClassCreated={handleClassCreated}
      />
    </Dialog>
  );
};

export default CreateUserDialog;