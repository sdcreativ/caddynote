import { useState, useEffect, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useStrkAuth } from '@/hooks/useStrkAuth';
import { apiClient, ApiError } from '@/lib/apiClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Mail, Building, Phone, Calendar, Eye, EyeOff, ShieldCheck, ShieldOff, LogOut } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { AuthService } from '@/services/authService';
import { TwoFactorAuthDialog } from '@/components/settings/TwoFactorAuthDialog';
import { SessionsPanel } from '@/components/settings/SessionsPanel';
import { uploadViaPresignedPost } from '@/lib/s3Upload';
import { tCommon } from '@/i18n/config';

const ProfilePage = () => {
  const { t } = useTranslation('profile');
  const { user, logout } = useStrkAuth();
  const { toast } = useToast();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [memberSince, setMemberSince] = useState<Date | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [mfaDialogOpen, setMfaDialogOpen] = useState(false);
  const [disableMfaPassword, setDisableMfaPassword] = useState('');
  const [isDisablingMfa, setIsDisablingMfa] = useState(false);
  const [showDisableMfaForm, setShowDisableMfaForm] = useState(false);

  useEffect(() => {
    setMfaEnabled(!!user?.mfaEnabled);
  }, [user?.mfaEnabled]);

  const handleDisableMfa = async () => {
    if (!disableMfaPassword) {
      toast({
        title: tCommon('status.error'),
        description: t('mfaDisableNeedPassword'),
        variant: 'destructive',
      });
      return;
    }
    setIsDisablingMfa(true);
    try {
      await apiClient.post('/auth/mfa/disable', { password: disableMfaPassword });
      setMfaEnabled(false);
      setShowDisableMfaForm(false);
      setDisableMfaPassword('');
      toast({ title: t('mfaDisabledTitle'), description: t('mfaDisabledBody') });
    } catch (error) {
      toast({
        title: tCommon('status.error'),
        description: error instanceof ApiError ? error.message : t('mfaDisableError'),
        variant: 'destructive',
      });
    } finally {
      setIsDisablingMfa(false);
    }
  };

  useEffect(() => {
    const fetchMemberSince = async () => {
      if (user?.id) {
        try {
          const { user: profile } = await apiClient.get<{ user: { createdAt: string } }>(`/users/${user.id}`);
          if (profile?.createdAt) {
            setMemberSince(new Date(profile.createdAt));
          }
        } catch (error) {
          console.error('Error fetching member since date:', error);
        }
      }
    };
    void fetchMemberSince();
  }, [user?.id]);

  const formatMemberSince = (date: Date | null) => {
    if (!date) return '—';
    return date.toLocaleDateString('fr-FR');
  };

  useEffect(() => {
    const resolveAvatar = async () => {
      if (!user?.profileImage) {
        setAvatarUrl(null);
        return;
      }
      if (
        user.profileImage.startsWith('http') ||
        user.profileImage.startsWith('blob:') ||
        user.profileImage.startsWith('/')
      ) {
        setAvatarUrl(user.profileImage);
        return;
      }
      try {
        const { downloadUrl } = await apiClient.post<{ downloadUrl: string }>('/files/presign-download', {
          key: user.profileImage,
        });
        setAvatarUrl(downloadUrl);
      } catch {
        setAvatarUrl(null);
      }
    };
    void resolveAvatar();
  }, [user?.profileImage]);

  const handlePhotoChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;
    setUploadingPhoto(true);
    try {
      const key = await uploadViaPresignedPost('avatars', file);
      await apiClient.patch(`/users/${user.id}`, { profileImage: key });
      toast({ title: t('photoUpdatedTitle'), description: t('photoUpdatedBody') });
      const { downloadUrl } = await apiClient.post<{ downloadUrl: string }>('/files/presign-download', { key });
      setAvatarUrl(downloadUrl);
    } catch (error) {
      toast({
        title: tCommon('status.error'),
        description: error instanceof ApiError ? error.message : t('uploadError'),
        variant: 'destructive',
      });
    } finally {
      setUploadingPhoto(false);
      e.target.value = '';
    }
  };

  const handleSaveChanges = () => {
    toast({
      title: t('savedTitle'),
      description: t('savedBody'),
    });
  };

  const handlePasswordChange = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast({
        title: tCommon('status.error'),
        description: t('passwordFieldsRequired'),
        variant: 'destructive',
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: tCommon('status.error'),
        description: t('passwordMismatch'),
        variant: 'destructive',
      });
      return;
    }

    if (newPassword.length < 6) {
      toast({
        title: tCommon('status.error'),
        description: t('passwordMin'),
        variant: 'destructive',
      });
      return;
    }

    setIsChangingPassword(true);

    try {
      const result = await AuthService.changePassword(currentPassword, newPassword);

      if (result.success) {
        toast({
          title: tCommon('status.success'),
          description: t('passwordSuccess'),
        });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        toast({
          title: tCommon('status.error'),
          description: result.error || t('passwordError'),
          variant: 'destructive',
        });
      }
    } catch {
      toast({
        title: tCommon('status.error'),
        description: t('unexpectedError'),
        variant: 'destructive',
      });
    } finally {
      setIsChangingPassword(false);
    }
  };

  if (!user) {
    return <div>{t('loading')}</div>;
  }

  return (
    <div className="space-y-6 py-6 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-2 md:space-y-0">
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <Button
          type="button"
          variant="outline"
          className="text-destructive border-destructive/30 hover:bg-destructive/5"
          onClick={() => void logout()}
        >
          <LogOut className="mr-2 h-4 w-4" />
          {t('logout')}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="col-span-1">
          <CardHeader className="text-center">
            <div className="mb-4 flex justify-center">
              <Avatar className="h-24 w-24">
                {avatarUrl ? (
                  <AvatarImage src={avatarUrl} alt={user.name ?? user.email ?? 'Profil'} />
                ) : (
                  <AvatarFallback className="bg-edusign-600 text-2xl text-white">
                    {(user.name ?? user.email ?? '?')
                      .split(' ')
                      .map((n) => n[0])
                      .join('')}
                  </AvatarFallback>
                )}
              </Avatar>
            </div>
            <div className="mb-4">
              <label className="inline-flex cursor-pointer items-center justify-center rounded-md border px-3 py-1.5 text-sm">
                {uploadingPhoto ? t('uploadingPhoto') : t('changePhoto')}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handlePhotoChange}
                  disabled={uploadingPhoto}
                />
              </label>
            </div>
            <CardTitle className="text-xl">{user.name}</CardTitle>
            <CardDescription className="capitalize">{user.role}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center space-x-3">
              <Mail className="h-5 w-5 text-gray-500" />
              <span>{user.email}</span>
            </div>
            <div className="flex items-center space-x-3">
              <Building className="h-5 w-5 text-gray-500" />
              <span>{t('brand')}</span>
            </div>
            <div className="flex items-center space-x-3">
              <Phone className="h-5 w-5 text-gray-500" />
              <span>+33 1 23 45 67 89</span>
            </div>
            <div className="flex items-center space-x-3">
              <Calendar className="h-5 w-5 text-gray-500" />
              <span>{t('memberSince', { date: formatMemberSince(memberSince) })}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-1 lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">{t('personalTitle')}</CardTitle>
            <CardDescription>{t('personalSubtitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="account">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="account">{t('tabAccount')}</TabsTrigger>
                <TabsTrigger value="security">{t('tabSecurity')}</TabsTrigger>
              </TabsList>
              <TabsContent value="account" className="space-y-4 pt-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label htmlFor="name" className="text-sm font-medium">
                      {t('fullName')}
                    </label>
                    <input
                      id="name"
                      type="text"
                      className="w-full rounded-md border p-2"
                      defaultValue={user.name}
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="email" className="text-sm font-medium">
                      {t('email')}
                    </label>
                    <input
                      id="email"
                      type="email"
                      className="w-full rounded-md border p-2"
                      defaultValue={user.email}
                      disabled
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="phone" className="text-sm font-medium">
                      {t('phone')}
                    </label>
                    <input
                      id="phone"
                      type="tel"
                      className="w-full rounded-md border p-2"
                      defaultValue="+33 1 23 45 67 89"
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="role" className="text-sm font-medium">
                      {t('role')}
                    </label>
                    <input
                      id="role"
                      type="text"
                      className="w-full rounded-md border p-2 capitalize"
                      defaultValue={user.role}
                      disabled
                    />
                  </div>
                </div>
                <div className="pt-4">
                  <Button onClick={handleSaveChanges} className="bg-edusign-600">
                    {t('saveChanges')}
                  </Button>
                </div>
              </TabsContent>
              <TabsContent value="security" className="space-y-4 pt-4">
                <div className="space-y-2">
                  <label htmlFor="current-password" className="text-sm font-medium">
                    {t('currentPassword')}
                  </label>
                  <div className="relative">
                    <Input
                      id="current-password"
                      type={showCurrentPassword ? 'text' : 'password'}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder={t('currentPasswordPlaceholder')}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      aria-label={showCurrentPassword ? tCommon('actions.close') : t('currentPassword')}
                    >
                      {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <label htmlFor="new-password" className="text-sm font-medium">
                    {t('newPassword')}
                  </label>
                  <div className="relative">
                    <Input
                      id="new-password"
                      type={showNewPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder={t('newPasswordPlaceholder')}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                    >
                      {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <label htmlFor="confirm-password" className="text-sm font-medium">
                    {t('confirmPassword')}
                  </label>
                  <div className="relative">
                    <Input
                      id="confirm-password"
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder={t('confirmPasswordPlaceholder')}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    >
                      {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <div className="pt-4">
                  <Button
                    onClick={() => void handlePasswordChange()}
                    disabled={isChangingPassword}
                    className="bg-edusign-600"
                  >
                    {isChangingPassword ? t('updatingPassword') : t('updatePassword')}
                  </Button>
                </div>

                <div className="space-y-3 border-t pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium">{t('mfaTitle')}</h4>
                      <p className="text-sm text-muted-foreground">{t('mfaBody')}</p>
                    </div>
                    <Badge variant={mfaEnabled ? 'default' : 'outline'} className="shrink-0">
                      {mfaEnabled ? (
                        <span className="flex items-center gap-1">
                          <ShieldCheck className="h-3 w-3" /> {t('mfaOn')}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <ShieldOff className="h-3 w-3" /> {t('mfaOff')}
                        </span>
                      )}
                    </Badge>
                  </div>

                  {!mfaEnabled && (
                    <Button variant="outline" onClick={() => setMfaDialogOpen(true)}>
                      {t('mfaEnable')}
                    </Button>
                  )}

                  {mfaEnabled && !showDisableMfaForm && (
                    <Button variant="outline" onClick={() => setShowDisableMfaForm(true)}>
                      {t('mfaDisable')}
                    </Button>
                  )}

                  {mfaEnabled && showDisableMfaForm && (
                    <div className="max-w-sm space-y-2">
                      <label htmlFor="disable-mfa-password" className="text-sm font-medium">
                        {t('mfaDisableConfirmLabel')}
                      </label>
                      <Input
                        id="disable-mfa-password"
                        type="password"
                        value={disableMfaPassword}
                        onChange={(e) => setDisableMfaPassword(e.target.value)}
                        placeholder={t('mfaDisablePasswordPlaceholder')}
                      />
                      <div className="flex gap-2">
                        <Button variant="destructive" onClick={() => void handleDisableMfa()} disabled={isDisablingMfa}>
                          {isDisablingMfa ? t('mfaDisabling') : tCommon('actions.confirm')}
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setShowDisableMfaForm(false);
                            setDisableMfaPassword('');
                          }}
                          disabled={isDisablingMfa}
                        >
                          {tCommon('actions.cancel')}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-3 border-t pt-6">
                  <h3 className="text-sm font-medium">{t('sessionsTitle')}</h3>
                  <SessionsPanel />
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <TwoFactorAuthDialog
        open={mfaDialogOpen}
        onOpenChange={setMfaDialogOpen}
        onEnabled={() => setMfaEnabled(true)}
      />
    </div>
  );
};

export default ProfilePage;
