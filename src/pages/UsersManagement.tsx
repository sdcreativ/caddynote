import { useState, useEffect } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, Edit, Trash2, UserPlus, UserCheck, GraduationCap, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { User } from '@/types/strk';
import { useStrkAuth } from '@/hooks/useStrkAuth';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useStrkUsers } from '@/hooks/useStrkUsers';
import { useStrkInstitutions } from '@/hooks/useStrkInstitutions';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { apiClient, ApiError } from '@/lib/apiClient';

type UserFormData = {
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  institutionId: string;
  phoneNumber: string;
};

/** Rôles créables ici = comptes d’accès. Élèves / enseignants → /students / /teachers. */
const ACCOUNT_CREATE_ROLES = [
  'school_admin',
  'secretary',
  'accountant',
  'supervisor',
  'parent',
  'admin',
] as const;

const getInitials = (name: string): string =>
  name
    .split(' ')
    .map((part) => part.charAt(0))
    .join('')
    .toUpperCase()
    .substring(0, 2);

const getRoleBadgeVariant = (role: string) => {
  switch (role) {
    case 'admin':
      return 'destructive' as const;
    case 'school_admin':
      return 'secondary' as const;
    case 'teacher':
    case 'head_teacher':
      return 'default' as const;
    case 'student':
      return 'outline' as const;
    default:
      return 'outline' as const;
  }
};

const UsersManagement = () => {
  const { t } = useTranslation('users');
  const { t: tc } = useTranslation('common');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const [formData, setFormData] = useState<UserFormData>({
    firstName: '',
    lastName: '',
    email: '',
    role: 'secretary',
    institutionId: '',
    phoneNumber: '',
  });

  const { user } = useStrkAuth();
  const {
    users,
    isLoading,
    error,
    loadUsersByInstitution,
    updateUser,
    assignToInstitution,
    deleteUser,
    reactivateUser,
  } = useStrkUsers();
  const { institutions } = useStrkInstitutions();

  /** Porte école uniquement — liste globale plateforme = /super-admin/users. */
  const isPlatformAdminWithoutSchool = user?.role === 'admin' && !user.institutionId;

  const reloadUsers = async () => {
    if (!user?.institutionId) return;
    await loadUsersByInstitution(user.institutionId);
  };

  const getRoleLabel = (role: string) => {
    const key = `roles.${role}` as const;
    const translated = t(key);
    return translated === key ? t('roles.user') : translated;
  };

  useEffect(() => {
    if (isPlatformAdminWithoutSchool) return;
    void reloadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recharge quand l’identité / établissement change
  }, [user?.id, user?.role, user?.institutionId, isPlatformAdminWithoutSchool]);

  if (isPlatformAdminWithoutSchool) {
    return <Navigate to="/super-admin/users" replace />;
  }

  const resetForm = () => {
    setFormData({
      firstName: '',
      lastName: '',
      email: '',
      role: 'secretary',
      institutionId: user?.institutionId || '',
      phoneNumber: '',
    });
  };

  const initEditForm = (account: User) => {
    const nameParts = (account.name || '').split(' ');
    setFormData({
      firstName: nameParts[0] || '',
      lastName: nameParts.slice(1).join(' ') || '',
      email: account.email || '',
      role: account.role || '',
      institutionId: account.institutionId || '',
      phoneNumber: account.phoneNumber || '',
    });
    setSelectedUser(account);
    setShowEditDialog(true);
  };

  const handleShowAddUser = () => {
    resetForm();
    setShowAddDialog(true);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target;
    setFormData((prev) => ({ ...prev, [id]: value }));
  };

  const handleAddUser = async () => {
    if (!formData.firstName || !formData.lastName || !formData.email || !formData.role) {
      toast({
        title: t('requiredTitle'),
        description: t('requiredBody'),
        variant: 'destructive',
      });
      return;
    }

    if (formData.role === 'student' || formData.role === 'teacher' || formData.role === 'head_teacher') {
      toast({
        title: t('metierRedirectTitle'),
        description: t('metierRedirectBody'),
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      const { emailSent } = await apiClient.post<{
        user: { id: string };
        tempPassword: string;
        emailSent?: boolean;
      }>('/users', {
        email: formData.email,
        firstName: formData.firstName,
        lastName: formData.lastName,
        role: formData.role,
        institutionId: formData.institutionId || undefined,
        phoneNumber: formData.phoneNumber,
      });

      toast({
        title: t('createdTitle'),
        description: emailSent
          ? t('createdBodyEmailSent', { email: formData.email })
          : t('createdBody', { email: formData.email }),
      });

      setShowAddDialog(false);
      resetForm();
      await reloadUsers();
    } catch (err) {
      console.error('Error creating user:', err);
      toast({
        title: tc('status.error'),
        description: err instanceof ApiError ? err.message : t('createError'),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateUser = async () => {
    if (!selectedUser) return;

    if (!formData.firstName || !formData.lastName || !formData.email || !formData.role) {
      toast({
        title: t('requiredTitle'),
        description: t('requiredBody'),
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      const updatedData: Partial<User> = {
        name: `${formData.firstName} ${formData.lastName}`.trim(),
        email: formData.email,
        role: formData.role as User['role'],
        phoneNumber: formData.phoneNumber || undefined,
      };

      const updatedUser = await updateUser(selectedUser.id, updatedData);

      if (updatedUser && formData.institutionId && formData.institutionId !== selectedUser.institutionId) {
        await assignToInstitution(selectedUser.id, formData.institutionId);
      }

      if (updatedUser) {
        toast({
          title: t('updatedTitle'),
          description: t('updatedBody'),
        });
        setShowEditDialog(false);
        setSelectedUser(null);
        await reloadUsers();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;
    const success = await deleteUser(selectedUser.id);
    if (success) {
      setShowDeleteDialog(false);
      setSelectedUser(null);
      await reloadUsers();
    }
  };

  const filteredUsers = users.filter((account) => {
    const matchesSearch =
      account.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      account.email?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesRole =
      activeTab === 'all' ||
      account.role === activeTab ||
      (activeTab === 'teacher' && account.role === 'head_teacher') ||
      (activeTab === 'staff' &&
        ['school_admin', 'secretary', 'accountant', 'supervisor', 'admin'].includes(account.role));

    return matchesSearch && matchesRole;
  });

  const getInstitutionName = (institutionId: string | undefined) => {
    if (!institutionId) return t('unassigned');
    const institution = institutions.find((inst) => inst.id === institutionId);
    return institution ? institution.name : t('unknownInstitution');
  };

  const isMetierAccount =
    selectedUser?.role === 'student' ||
    selectedUser?.role === 'teacher' ||
    selectedUser?.role === 'head_teacher';

  return (
    <div className="space-y-6 py-6 animate-fade-in">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('title')}</h1>
          <p className="mt-1 text-muted-foreground">{t('subtitle')}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link to="/students">
              <GraduationCap className="mr-2 h-4 w-4" aria-hidden />
              {t('ctaStudents')}
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/teachers">
              <Users className="mr-2 h-4 w-4" aria-hidden />
              {t('ctaTeachers')}
            </Link>
          </Button>
          <Button onClick={handleShowAddUser}>
            <UserPlus className="mr-2 h-5 w-5" aria-hidden />
            {t('addUser')}
          </Button>
        </div>
      </div>

      <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
        {t('accountsOnlyHint')}{' '}
        <Link className="font-medium text-foreground underline-offset-4 hover:underline" to="/students">
          {t('ctaStudents')}
        </Link>
        {' · '}
        <Link className="font-medium text-foreground underline-offset-4 hover:underline" to="/teachers">
          {t('ctaTeachers')}
        </Link>
      </div>

      {user?.role === 'admin' && user.institutionId ? (
        <div className="rounded-lg border border-sky-200 bg-sky-50/80 p-4 text-sm text-sky-950">
          {t('schoolScopeHint')}{' '}
          <Link
            className="font-medium underline-offset-4 hover:underline"
            to="/super-admin/users"
          >
            {t('platformAccountsLink')}
          </Link>
        </div>
      ) : null}

      <div className="rounded-lg bg-white p-6 shadow-sm">
        <div className="mb-6 flex flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="relative w-full sm:max-w-xs">
            <Input
              type="text"
              placeholder={t('searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
            <Search className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" aria-hidden />
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full sm:w-auto">
            <TabsList>
              <TabsTrigger value="all">{t('tabs.all')}</TabsTrigger>
              <TabsTrigger value="staff">{t('tabs.staff')}</TabsTrigger>
              <TabsTrigger value="teacher">{t('tabs.teacher')}</TabsTrigger>
              <TabsTrigger value="student">{t('tabs.student')}</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {isLoading ? (
          <div className="py-12 text-center">
            <p className="text-gray-500">{t('loading')}</p>
          </div>
        ) : error ? (
          <div className="rounded-lg border border-red-200 py-12 text-center">
            <p className="text-red-500">{error}</p>
            <Button variant="outline" className="mt-2" onClick={() => void reloadUsers()}>
              {tc('actions.retry')}
            </Button>
          </div>
        ) : filteredUsers.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('columns.user')}</TableHead>
                <TableHead>{t('columns.role')}</TableHead>
                <TableHead>{t('columns.institution')}</TableHead>
                <TableHead>{t('columns.email')}</TableHead>
                <TableHead>{t('columns.status')}</TableHead>
                <TableHead className="text-right">{t('columns.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.map((account) => (
                <TableRow key={account.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar>
                        {account.profileImage ? (
                          <AvatarImage src={account.profileImage} alt={account.name} />
                        ) : (
                          <AvatarFallback>{getInitials(account.name || '')}</AvatarFallback>
                        )}
                      </Avatar>
                      <div className="font-medium">{account.name}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={getRoleBadgeVariant(account.role)}>{getRoleLabel(account.role)}</Badge>
                  </TableCell>
                  <TableCell>{getInstitutionName(account.institutionId)}</TableCell>
                  <TableCell>{account.email}</TableCell>
                  <TableCell>
                    <Badge variant={account.isActive === false ? 'destructive' : 'secondary'}>
                      {account.isActive === false ? t('status.disabled') : t('status.active')}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => initEditForm(account)}
                        aria-label={t('aria.edit', { name: account.name })}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      {account.isActive === false ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => void reactivateUser(account.id)}
                          aria-label={t('aria.reactivate', { name: account.name })}
                        >
                          <UserCheck className="h-4 w-4 text-green-600" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setSelectedUser(account);
                            setShowDeleteDialog(true);
                          }}
                          aria-label={t('aria.deactivate', { name: account.name })}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="rounded-lg border border-dashed py-12 text-center">
            <p className="text-gray-500">{t('empty')}</p>
          </div>
        )}
      </div>

      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-[525px]">
          <DialogHeader>
            <DialogTitle>{t('edit.title')}</DialogTitle>
            <DialogDescription>{t('edit.description')}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {isMetierAccount ? (
              <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
                {t('edit.metierHint')}{' '}
                <Link
                  className="font-medium text-foreground underline-offset-4 hover:underline"
                  to={selectedUser?.role === 'student' ? '/students' : '/teachers'}
                >
                  {selectedUser?.role === 'student' ? t('ctaStudents') : t('ctaTeachers')}
                </Link>
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">{t('fields.firstName')}</Label>
                <Input
                  id="firstName"
                  placeholder={t('fields.firstNamePlaceholder')}
                  value={formData.firstName}
                  onChange={handleInputChange}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">{t('fields.lastName')}</Label>
                <Input
                  id="lastName"
                  placeholder={t('fields.lastNamePlaceholder')}
                  value={formData.lastName}
                  onChange={handleInputChange}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">{t('fields.email')}</Label>
              <Input
                id="email"
                type="email"
                placeholder={t('fields.emailPlaceholder')}
                value={formData.email}
                onChange={handleInputChange}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phoneNumber">{t('fields.phone')}</Label>
              <Input
                id="phoneNumber"
                type="tel"
                placeholder={t('fields.phonePlaceholder')}
                value={formData.phoneNumber}
                onChange={handleInputChange}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="role">{t('fields.role')}</Label>
              <Select
                onValueChange={(value) => setFormData((prev) => ({ ...prev, role: value }))}
                value={formData.role}
                disabled={isMetierAccount}
              >
                <SelectTrigger id="role">
                  <SelectValue placeholder={t('fields.rolePlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNT_CREATE_ROLES.map((role) => (
                    <SelectItem key={role} value={role}>
                      {t(`createDialog.roles.${role}`, { defaultValue: getRoleLabel(role) })}
                    </SelectItem>
                  ))}
                  {isMetierAccount ? (
                    <SelectItem value={formData.role}>{getRoleLabel(formData.role)}</SelectItem>
                  ) : null}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="institution">{t('fields.institution')}</Label>
              <Select
                onValueChange={(value) => setFormData((prev) => ({ ...prev, institutionId: value }))}
                value={formData.institutionId}
              >
                <SelectTrigger id="institution">
                  <SelectValue placeholder={t('fields.institutionPlaceholder')} />
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
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              {tc('actions.cancel')}
            </Button>
            <Button onClick={() => void handleUpdateUser()} disabled={saving}>
              {t('edit.submit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deactivate.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('deactivate.description', {
                name: selectedUser ? `"${selectedUser.name}"` : t('deactivate.thisAccount'),
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc('actions.cancel')}</AlertDialogCancel>
            <Button variant="destructive" onClick={() => void handleDeleteUser()}>
              {t('deactivate.submit')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-[525px]">
          <DialogHeader>
            <DialogTitle>{t('add.title')}</DialogTitle>
            <DialogDescription>{t('add.description')}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
              {t('add.metierHint')}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">{t('fields.firstName')}</Label>
                <Input
                  id="firstName"
                  placeholder={t('fields.firstNamePlaceholder')}
                  value={formData.firstName}
                  onChange={handleInputChange}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">{t('fields.lastName')}</Label>
                <Input
                  id="lastName"
                  placeholder={t('fields.lastNamePlaceholder')}
                  value={formData.lastName}
                  onChange={handleInputChange}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">{t('fields.email')}</Label>
              <Input
                id="email"
                type="email"
                placeholder={t('fields.emailPlaceholderAdd')}
                value={formData.email}
                onChange={handleInputChange}
              />
            </div>

            <div className="space-y-2 rounded-lg border border-blue-200 bg-blue-50 p-4">
              <Label className="text-blue-800">{t('fields.password')}</Label>
              <p className="text-sm text-blue-600">{t('add.passwordHint')}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="phoneNumber">{t('fields.phone')}</Label>
              <Input
                id="phoneNumber"
                type="tel"
                placeholder={t('fields.phonePlaceholder')}
                value={formData.phoneNumber}
                onChange={handleInputChange}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="role">{t('fields.role')}</Label>
              <Select
                onValueChange={(value) => setFormData((prev) => ({ ...prev, role: value }))}
                value={formData.role}
              >
                <SelectTrigger id="role">
                  <SelectValue placeholder={t('fields.rolePlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNT_CREATE_ROLES.map((role) => (
                    <SelectItem key={role} value={role}>
                      {t(`createDialog.roles.${role}`, { defaultValue: getRoleLabel(role) })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="institution">{t('fields.institutionOptional')}</Label>
              <Select
                onValueChange={(value) => setFormData((prev) => ({ ...prev, institutionId: value }))}
                value={formData.institutionId}
              >
                <SelectTrigger id="institution">
                  <SelectValue placeholder={t('fields.institutionPlaceholder')} />
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
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              {tc('actions.cancel')}
            </Button>
            <Button onClick={() => void handleAddUser()} disabled={saving || isLoading}>
              {saving ? t('add.submitting') : t('add.submit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UsersManagement;
