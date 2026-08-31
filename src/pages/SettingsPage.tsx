import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { useStrkAuth } from '@/hooks/useStrkAuth';
import { StrkSettingsService } from '@/services/strkSettingsService';
import { fetchGradingScales, createGradingScale, deleteGradingScale, type StrkGradingScale } from '@/services/strkGradingScaleService';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Link } from 'react-router-dom';
import { QuotasAndFlagsPanel } from '@/components/admin/QuotasAndFlagsPanel';
import LogsCenter from '@/components/admin/LogsCenter';
import { SessionsPanel } from '@/components/settings/SessionsPanel';
import { CommunicationPreferencesPanel } from '@/components/settings/CommunicationPreferencesPanel';
import { WebPushOptIn } from '@/components/settings/WebPushOptIn';
import {
  Settings,
  Bell,
  Shield,
  Database,
  Clock,
  GraduationCap,
  Trash2,
  Download,
  ScrollText,
  ExternalLink,
} from 'lucide-react';

const SettingsPage = () => {
  const { t } = useTranslation('settings');
  const { t: tc } = useTranslation('common');
  const { user } = useStrkAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  // États pour les paramètres
  const [systemSettings, setSystemSettings] = useState({
    appName: 'CaddyNote',
    supportEmail: 'support@caddynote.com',
    maintenanceMode: false,
    maxInstitutions: 100,
    maxUsersPerInstitution: 10000
  });

  const [attendanceSettings, setAttendanceSettings] = useState({
    autoMarkAbsent: true,
    gracePeriodMinutes: 15,
    allowLateMarking: true,
    requireJustification: true
  });

  // EVA-002 : barèmes de notation configurables par établissement.
  const [gradingScales, setGradingScales] = useState<StrkGradingScale[]>([]);
  const [newScale, setNewScale] = useState({ name: '', max_value: '20', is_default: false });

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      const [system, attendance] = await Promise.all([
        StrkSettingsService.getSystemSettings(user?.id),
        StrkSettingsService.getAttendanceSettings(user?.id)
      ]);

      setSystemSettings(system);
      setAttendanceSettings(attendance);
    } catch (error) {
      console.error('Error loading settings:', error);
      toast({
        title: tc('status.error'),
        description: t('loadError'),
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  }, [user, toast, t, tc]);

  useEffect(() => {
    if (user) {
      loadSettings();
    }
  }, [user, loadSettings]);

  const loadGradingScales = useCallback(async () => {
    if (!user?.institutionId) return;
    setGradingScales(await fetchGradingScales(user.institutionId));
  }, [user?.institutionId]);

  useEffect(() => {
    loadGradingScales();
  }, [loadGradingScales]);

  const handleCreateGradingScale = async () => {
    if (!user?.institutionId) {
      toast({
        title: tc('status.error'),
        description: t('grading.needInstitution'),
        variant: 'destructive',
      });
      return;
    }
    if (!newScale.name.trim() || !newScale.max_value) {
      toast({
        title: tc('status.error'),
        description: t('grading.createError'),
        variant: 'destructive',
      });
      return;
    }
    const created = await createGradingScale({
      institution_id: user.institutionId,
      name: newScale.name.trim(),
      max_value: parseFloat(newScale.max_value),
      is_default: newScale.is_default,
    });
    if (created) {
      toast({ title: t('grading.createdTitle'), description: t('grading.createdBody', { name: created.name }) });
      setNewScale({ name: '', max_value: '20', is_default: false });
      loadGradingScales();
    } else {
      toast({ title: tc('status.error'), description: t('grading.createError'), variant: 'destructive' });
    }
  };

  const handleDeleteGradingScale = async (id: string) => {
    if (await deleteGradingScale(id)) {
      loadGradingScales();
    } else {
      toast({ title: tc('status.error'), description: t('grading.deleteError'), variant: 'destructive' });
    }
  };

  const handleSaveSystemSettings = async () => {
    try {
      setLoading(true);
      await StrkSettingsService.setSystemSettings(systemSettings, user?.id);
      toast({
        title: tc('status.success'),
        description: t('system.saved')
      });
    } catch (error) {
      console.error('Error saving system settings:', error);
      toast({
        title: tc('status.error'),
        description: t('saveError', { message: error instanceof Error ? error.message : t('unknownError') }),
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAttendanceSettings = async () => {
    try {
      setLoading(true);

      if (!user) {
        throw new Error(t('unauthenticated'));
      }

      await StrkSettingsService.setAttendanceSettings(attendanceSettings, user?.id);
      toast({
        title: tc('status.success'),
        description: t('attendance.saved')
      });
    } catch (error) {
      console.error('Error saving attendance settings:', error);
      toast({
        title: tc('status.error'),
        description: t('saveError', { message: error instanceof Error ? error.message : t('unknownError') }),
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Définir les onglets disponibles selon le rôle
  const getAvailableTabs = () => {
    const baseTabs = ['notifications', 'security'];
    const hasInstitution = Boolean(user?.institutionId);

    if (user?.role === 'admin' && !hasInstitution) {
      // Super admin plateforme : pas de barèmes / assiduité (liés à un établissement).
      return ['system', 'notifications', 'security', 'saas'];
    }

    if (user?.role === 'admin' || user?.role === 'school_admin') {
      return ['system', 'notifications', 'attendance', 'grading', 'security', 'saas'];
    }

    if (user?.role === 'teacher' || user?.role === 'head_teacher') {
      return ['notifications', 'attendance', 'security'];
    }

    return baseTabs;
  };

  const availableTabs = getAvailableTabs();

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-center space-x-2">
        <Settings className="h-6 w-6" />
        <h1 className="text-3xl font-bold">{t('title')}</h1>
      </div>

      {(user?.role === 'school_admin' || user?.role === 'admin') && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t('tools.title')}</CardTitle>
            <p className="text-sm text-muted-foreground">{t('tools.hint')}</p>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/exports">
                <Download className="mr-2 h-4 w-4" />
                {t('tools.exports')}
                <ExternalLink className="ml-2 h-3.5 w-3.5 opacity-60" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/audit-log">
                <ScrollText className="mr-2 h-4 w-4" />
                {t('tools.audit')}
                <ExternalLink className="ml-2 h-3.5 w-3.5 opacity-60" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue={availableTabs[0]} className="space-y-4">
        <div className="w-full min-w-0 overflow-x-auto pb-1">
          <TabsList className="inline-flex h-auto min-w-max w-max justify-start">
            {availableTabs.includes('system') && (
              <TabsTrigger value="system" className="shrink-0">
                {t('tabs.system')}
              </TabsTrigger>
            )}
            {availableTabs.includes('notifications') && (
              <TabsTrigger value="notifications" className="shrink-0">
                {t('tabs.notifications')}
              </TabsTrigger>
            )}
            {availableTabs.includes('attendance') && (
              <TabsTrigger value="attendance" className="shrink-0">
                {t('tabs.attendance')}
              </TabsTrigger>
            )}
            {availableTabs.includes('grading') && (
              <TabsTrigger value="grading" className="shrink-0">
                {t('tabs.grading')}
              </TabsTrigger>
            )}
            {availableTabs.includes('security') && (
              <TabsTrigger value="security" className="shrink-0">
                {t('tabs.security')}
              </TabsTrigger>
            )}
            {availableTabs.includes('saas') && (
              <TabsTrigger value="saas" className="shrink-0">
                {t('tabs.saas')}
              </TabsTrigger>
            )}
          </TabsList>
        </div>

        {availableTabs.includes('system') && (
        <TabsContent value="system" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Database className="h-5 w-5" />
                <span>{t('system.title')}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="appName">{t('system.appName')}</Label>
                  <Input
                    id="appName"
                    value={systemSettings.appName}
                    onChange={(e) => setSystemSettings({...systemSettings, appName: e.target.value})}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="supportEmail">{t('system.supportEmail')}</Label>
                  <Input
                    id="supportEmail"
                    type="email"
                    value={systemSettings.supportEmail}
                    onChange={(e) => setSystemSettings({...systemSettings, supportEmail: e.target.value})}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="maxInstitutions">{t('system.maxInstitutions')}</Label>
                  <Input
                    id="maxInstitutions"
                    type="number"
                    value={systemSettings.maxInstitutions}
                    onChange={(e) => setSystemSettings({...systemSettings, maxInstitutions: parseInt(e.target.value)})}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="maxUsers">{t('system.maxUsers')}</Label>
                  <Input
                    id="maxUsers"
                    type="number"
                    value={systemSettings.maxUsersPerInstitution}
                    onChange={(e) => setSystemSettings({...systemSettings, maxUsersPerInstitution: parseInt(e.target.value)})}
                  />
                </div>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{t('system.maintenance')}</Label>
                  <p className="text-sm text-muted-foreground">
                    {t('system.maintenanceHint')}
                  </p>
                </div>
                <Switch
                  checked={systemSettings.maintenanceMode}
                  onCheckedChange={(checked) => setSystemSettings({...systemSettings, maintenanceMode: checked})}
                />
              </div>

              <Button onClick={handleSaveSystemSettings} disabled={loading}>
                {t('system.save')}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
        )}

        <TabsContent value="notifications" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Bell className="h-5 w-5" />
                <span>{t('notifications.title')}</span>
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {t('notifications.subtitle')}
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              <CommunicationPreferencesPanel />
              <div className="space-y-2 border-t pt-4">
                <p className="text-sm font-medium">{t('webPush.title')}</p>
                <p className="text-sm text-muted-foreground">{t('webPush.subtitle')}</p>
                <WebPushOptIn />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {availableTabs.includes('attendance') && (
        <TabsContent value="attendance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Clock className="h-5 w-5" />
                <span>{t('attendance.title')}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>{t('attendance.autoMarkAbsent')}</Label>
                    <p className="text-sm text-muted-foreground">
                      {t('attendance.autoMarkAbsentHint')}
                    </p>
                  </div>
                  <Switch
                    checked={attendanceSettings.autoMarkAbsent}
                    onCheckedChange={(checked) => setAttendanceSettings({...attendanceSettings, autoMarkAbsent: checked})}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="gracePeriod">{t('attendance.gracePeriod')}</Label>
                  <Input
                    id="gracePeriod"
                    type="number"
                    value={attendanceSettings.gracePeriodMinutes}
                    onChange={(e) => setAttendanceSettings({...attendanceSettings, gracePeriodMinutes: parseInt(e.target.value)})}
                  />
                  <p className="text-sm text-muted-foreground">
                    {t('attendance.gracePeriodHint')}
                  </p>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>{t('attendance.allowLateMarking')}</Label>
                    <p className="text-sm text-muted-foreground">
                      {t('attendance.allowLateMarkingHint')}
                    </p>
                  </div>
                  <Switch
                    checked={attendanceSettings.allowLateMarking}
                    onCheckedChange={(checked) => setAttendanceSettings({...attendanceSettings, allowLateMarking: checked})}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>{t('attendance.requireJustification')}</Label>
                    <p className="text-sm text-muted-foreground">
                      {t('attendance.requireJustificationHint')}
                    </p>
                  </div>
                  <Switch
                    checked={attendanceSettings.requireJustification}
                    onCheckedChange={(checked) => setAttendanceSettings({...attendanceSettings, requireJustification: checked})}
                  />
                </div>
              </div>

              <Button onClick={handleSaveAttendanceSettings} disabled={loading}>
                {t('attendance.save')}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
        )}

        {availableTabs.includes('grading') && (
        <TabsContent value="grading" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <GraduationCap className="h-5 w-5" />
                <span>{t('grading.title')}</span>
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {t('grading.subtitle')}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                {gradingScales.map((scale) => (
                  <div key={scale.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{scale.name}</span>
                      <span className="text-sm text-muted-foreground">{t('grading.onMax', { max: scale.max_value })}</span>
                      {scale.is_default && <Badge variant="secondary">{t('grading.default')}</Badge>}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteGradingScale(scale.id)}
                      aria-label={t('grading.deleteAria', { name: scale.name })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                {gradingScales.length === 0 && (
                  <p className="text-sm text-muted-foreground py-4 text-center">{t('grading.empty')}</p>
                )}
              </div>

              <Separator />

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <div className="space-y-2">
                  <Label htmlFor="scaleName">{t('grading.name')}</Label>
                  <Input
                    id="scaleName"
                    placeholder={t('grading.namePlaceholder')}
                    value={newScale.name}
                    onChange={(e) => setNewScale({ ...newScale, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="scaleMax">{t('grading.max')}</Label>
                  <Input
                    id="scaleMax"
                    type="number"
                    min="1"
                    value={newScale.max_value}
                    onChange={(e) => setNewScale({ ...newScale, max_value: e.target.value })}
                  />
                </div>
                <div className="flex items-center gap-2 pb-2">
                  <Checkbox
                    id="scaleDefault"
                    checked={newScale.is_default}
                    onCheckedChange={(checked) => setNewScale({ ...newScale, is_default: checked === true })}
                  />
                  <Label htmlFor="scaleDefault" className="font-normal">{t('grading.asDefault')}</Label>
                </div>
              </div>
              <Button onClick={handleCreateGradingScale}>{t('grading.add')}</Button>
            </CardContent>
          </Card>
        </TabsContent>
        )}

        {availableTabs.includes('security') && (
        <TabsContent value="security" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Shield className="h-5 w-5" />
                <span>{t('security.sessionsTitle')}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <SessionsPanel />
            </CardContent>
          </Card>
          {(user?.role === 'admin' || user?.role === 'school_admin') && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Shield className="h-5 w-5" />
                  <span>{t('security.auditTitle')}</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <LogsCenter />
              </CardContent>
            </Card>
          )}
        </TabsContent>
        )}

        {availableTabs.includes('saas') && (
        <TabsContent value="saas" className="space-y-4">
          <QuotasAndFlagsPanel />
        </TabsContent>
        )}
      </Tabs>
    </div>
  );
};

export default SettingsPage;
