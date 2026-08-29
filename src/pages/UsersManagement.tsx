import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { PlusCircle, Search, Edit, Trash2, UserPlus, UserCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { User } from '@/types/strk';
import { useStrkAuth } from '@/hooks/useStrkAuth';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useStrkUsers } from '@/hooks/useStrkUsers';
import { useStrkInstitutions } from '@/hooks/useStrkInstitutions';
import { useStrkClasses } from '@/hooks/useStrkClasses';
import { assignTeacherToClass } from '@/services/strkClassService';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { apiClient, ApiError } from '@/lib/apiClient';
import { CreateClassDialog } from '@/components/admin/CreateClassDialog';
import { Plus } from 'lucide-react';

type UserFormData = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role: string;
  institutionId: string;
  phoneNumber: string;
  classId?: string;
};

const getInitials = (name: string): string => {
  return name
    .split(' ')
    .map(part => part.charAt(0))
    .join('')
    .toUpperCase()
    .substring(0, 2);
};

const getRoleBadgeVariant = (role: string) => {
  switch (role) {
    case 'admin':
      return 'destructive';
    case 'school_admin':
      return 'secondary';
    case 'teacher':
      return 'default';
    case 'student':
      return 'outline';
    default:
      return 'outline';
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
  const { toast } = useToast();

  const [formData, setFormData] = useState<UserFormData>({
    firstName: '',
    lastName: '',
    email: '',
    password: '', // Will be auto-generated
    role: '',
    institutionId: '',
    phoneNumber: '',
  });
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [showCreateClassDialog, setShowCreateClassDialog] = useState(false);

  const { user } = useStrkAuth();
  const { 
    users, 
    isLoading, 
    error, 
    loadUsersByInstitution,
    loadAllUsers,
    updateUser,
    assignToInstitution,
    addUser,
    deleteUser,
    reactivateUser
  } = useStrkUsers();
  const { institutions } = useStrkInstitutions();
  const { classes, loadClassesByInstitution, assignStudents } = useStrkClasses();

  const reloadUsers = async () => {
    if (!user) return;
    // Liste globale réservée à l’admin plateforme ; direction → son établissement.
    if (user.role === 'admin' && !user.institutionId) {
      await reloadUsers();
      return;
    }
    if (user.institutionId) {
      await loadUsersByInstitution(user.institutionId);
      return;
    }
    await loadAllUsers();
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'admin':
        return t('roles.admin');
      case 'school_admin':
        return t('roles.school_admin');
      case 'teacher':
        return t('roles.teacher');
      case 'student':
        return t('roles.student');
      default:
        return t('roles.user');
    }
  };

  useEffect(() => {
    void reloadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recharge quand l’identité / établissement change
  }, [user?.id, user?.role, user?.institutionId]);

  const resetForm = () => {
    setFormData({
      firstName: '',
      lastName: '',
      email: '',
      password: '',
      role: '',
      institutionId: '',
      phoneNumber: '',
      classId: '__none__',
    });
    setSelectedClasses([]);
  };

  const initEditForm = async (user: User) => {
    const nameParts = (user.name || '').split(' ');
    setFormData({
      firstName: nameParts[0] || '',
      lastName: nameParts.slice(1).join(' ') || '',
      email: user.email || '',
      password: '', // Ne pas pré-remplir le mot de passe
      role: user.role || '',
      institutionId: user.institutionId || '',
      phoneNumber: user.phoneNumber || '',
      classId: '__none__',
    });

    if ((user.role === 'student' || user.role === 'teacher') && user.institutionId) {
      await loadClassesByInstitution(user.institutionId);

      if (user.role === 'student' && user.id) {
        try {
          const { student } = await apiClient.get<{
            student: { classId?: string | null; class?: { id: string } | null };
          }>(`/students/${user.id}`);
          const classId = student.classId || student.class?.id;
          if (classId) {
            setFormData((prev) => ({ ...prev, classId }));
          }
        } catch {
          // Préremplissage best-effort — le formulaire reste utilisable.
        }
      }

      if (user.role === 'teacher' && user.id) {
        try {
          const { classes } = await apiClient.get<{ classes: { id: string }[] }>(
            `/classes?teacherId=${encodeURIComponent(user.id)}`
          );
          if (classes?.[0]?.id) {
            setFormData((prev) => ({ ...prev, classId: classes[0].id }));
          }
        } catch {
          // Préremplissage best-effort.
        }
      }
    }

    setSelectedUser(user);
    setShowEditDialog(true);
  };

  const handleShowAddUser = () => {
    resetForm();
    setShowAddDialog(true);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target;
    setFormData(prev => ({ ...prev, [id]: value }));
  };

  const handleRoleChange = (value: string) => {
    setFormData(prev => ({ ...prev, role: value, classId: '__none__' }));
    
    // Si c'est un enseignant ou étudiant et qu'une institution est sélectionnée, charger les classes
    if ((value === 'teacher' || value === 'student') && formData.institutionId) {
      loadClassesByInstitution(formData.institutionId);
    }
  };

  const handleInstitutionChange = (value: string) => {
    setFormData(prev => ({ ...prev, institutionId: value, classId: '__none__' }));

    // Load classes for the selected institution if the role is teacher or student
    if (value && (formData.role === 'teacher' || formData.role === 'student')) {
      loadClassesByInstitution(value);
    }
  };

  const handleClassChange = (value: string) => {
    setFormData(prev => ({ ...prev, classId: value }));
  };

  const handleAddUser = async () => {
    if (!formData.firstName || !formData.lastName || !formData.email || !formData.role) {
      toast({
        title: t('requiredTitle'),
        description: t('requiredBody'),
        variant: "destructive"
      });
      return;
    }

    try {
      const { user } = await apiClient.post<{ user: { id: string }; tempPassword: string }>('/users', {
        email: formData.email,
        firstName: formData.firstName,
        lastName: formData.lastName,
        role: formData.role,
        institutionId: formData.institutionId || undefined,
        phoneNumber: formData.phoneNumber,
      });

      // Si c'est un étudiant et qu'une classe est sélectionnée, l'assigner à la classe
      if (formData.role === 'student' && formData.classId && formData.classId !== '__none__') {
        try {
          await assignStudents(formData.classId, [user.id]);
        } catch (error) {
          console.error('Erreur lors de l\'assignation de l\'étudiant à la classe:', error);
        }
      }

      // Si c'est un enseignant et qu'une classe est sélectionnée, l'assigner à la classe
      if (formData.role === 'teacher' && formData.classId && formData.classId !== '__none__') {
        try {
          await assignTeacherToClass(formData.classId, user.id);
        } catch (error) {
          console.error('Erreur lors de l\'assignation de l\'enseignant à la classe:', error);
        }
      }

      toast({
        title: t('createdTitle'),
        description: t('createdBody', { email: formData.email }),
      });

      setShowAddDialog(false);
      resetForm();

      // Recharger tous les utilisateurs
      await reloadUsers();
    } catch (error) {
      console.error('Error creating user:', error);
      toast({
        title: tc('status.error'),
        description: error instanceof ApiError ? error.message : t('createError'),
        variant: "destructive"
      });
    }
  };

  const handleUpdateUser = async () => {
    if (!selectedUser) return;

    if (!formData.firstName || !formData.lastName || !formData.email || !formData.role) {
      toast({
        title: t('requiredTitle'),
        description: t('requiredBody'),
        variant: "destructive"
      });
      return;
    }

    const updatedData: Partial<User> = {
      name: `${formData.firstName} ${formData.lastName}`.trim(),
      email: formData.email,
      role: formData.role as User['role'],
      phoneNumber: formData.phoneNumber || undefined
    };

    const updatedUser = await updateUser(selectedUser.id, updatedData);

    if (updatedUser && formData.institutionId && formData.institutionId !== selectedUser.institutionId) {
      await assignToInstitution(selectedUser.id, formData.institutionId);
    }

    if (updatedUser) {
      // Si c'est un étudiant et qu'une classe est sélectionnée, l'assigner à la classe
      if (formData.role === 'student' && formData.classId && formData.classId !== '__none__' && selectedUser.id) {
        try {
          await assignStudents(formData.classId, [selectedUser.id]);
        } catch (error) {
          console.error('Erreur lors de l\'assignation de l\'étudiant à la classe:', error);
        }
      }
      
      // Si c'est un enseignant et qu'une classe est sélectionnée, l'assigner à la classe
      if (formData.role === 'teacher' && formData.classId && formData.classId !== '__none__' && selectedUser.id) {
        try {
          await assignTeacherToClass(formData.classId, selectedUser.id);
        } catch (error) {
          console.error('Erreur lors de l\'assignation de l\'enseignant à la classe:', error);
        }
      }

      setShowEditDialog(false);
      setSelectedUser(null);
      resetForm();

      toast({
        title: t('updatedTitle'),
        description: t('updatedBody')
      });

      // Reload all users to ensure consistency
      await reloadUsers();
    }
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;

    const success = await deleteUser(selectedUser.id);

    if (success) {
      setShowDeleteDialog(false);
      setSelectedUser(null);

      // Reload all users to ensure consistency
      await reloadUsers();
    }
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = 
      user.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
      user.email?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesRole =
      activeTab === 'all' ||
      user.role === activeTab ||
      (activeTab === 'teacher' && user.role === 'head_teacher');

    return matchesSearch && matchesRole;
  });

  const getInstitutionName = (institutionId: string | undefined) => {
    if (!institutionId) return t('unassigned');
    const institution = institutions.find(inst => inst.id === institutionId);
    return institution ? institution.name : t('unknownInstitution');
  };

  return (
    <div className="space-y-6 py-6 animate-fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0">
        <div>
          <h1 className="text-3xl font-bold">{t('title')}</h1>
          <p className="text-gray-500 mt-1">
            {t('subtitle')}
          </p>
        </div>

        <Button onClick={handleShowAddUser}>
          <UserPlus className="mr-2 h-5 w-5" />
          {t('addUser')}
        </Button>
      </div>

      <div className="bg-white shadow-sm rounded-lg p-6">
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-center mb-6">
          <div className="relative w-full sm:max-w-xs">
            <Input
              type="text"
              placeholder={t('searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
            <Search className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full sm:w-auto">
            <TabsList>
              <TabsTrigger value="all">{t('tabs.all')}</TabsTrigger>
              <TabsTrigger value="admin">{t('tabs.admin')}</TabsTrigger>
              <TabsTrigger value="school_admin">{t('tabs.school_admin')}</TabsTrigger>
              <TabsTrigger value="teacher">{t('tabs.teacher')}</TabsTrigger>
              <TabsTrigger value="student">{t('tabs.student')}</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {isLoading ? (
          <div className="text-center py-12">
            <p className="text-gray-500">{t('loading')}</p>
          </div>
        ) : error ? (
          <div className="text-center py-12 border border-red-200 rounded-lg">
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
              {filteredUsers.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar>
                        {user.profileImage ? (
                          <AvatarImage src={user.profileImage} alt={user.name} />
                        ) : (
                          <AvatarFallback>{getInitials(user.name || '')}</AvatarFallback>
                        )}
                      </Avatar>
                      <div className="font-medium">{user.name}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={getRoleBadgeVariant(user.role)}>
                      {getRoleLabel(user.role)}
                    </Badge>
                  </TableCell>
                  <TableCell>{getInstitutionName(user.institutionId)}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    {/* PER-005 : désactivé n'est plus synonyme de supprimé — l'affichage doit permettre de le distinguer et de revenir en arrière. */}
                    <Badge variant={user.isActive === false ? 'destructive' : 'secondary'}>
                      {user.isActive === false ? t('status.disabled') : t('status.active')}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => initEditForm(user)}
                        aria-label={t('aria.edit', { name: user.name })}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      {user.isActive === false ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => reactivateUser(user.id)}
                          aria-label={t('aria.reactivate', { name: user.name })}
                        >
                          <UserCheck className="h-4 w-4 text-green-600" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setSelectedUser(user);
                            setShowDeleteDialog(true);
                          }}
                          aria-label={t('aria.deactivate', { name: user.name })}
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
          <div className="text-center py-12 border border-dashed rounded-lg">
            <p className="text-gray-500">{t('empty')}</p>
          </div>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-[525px]">
          <DialogHeader>
            <DialogTitle>{t('edit.title')}</DialogTitle>
            <DialogDescription>
              {t('edit.description')}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
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
              <Select onValueChange={handleRoleChange} value={formData.role}>
                <SelectTrigger id="role">
                  <SelectValue placeholder={t('fields.rolePlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">{t('roleOptions.admin')}</SelectItem>
                  <SelectItem value="school_admin">{t('roleOptions.school_admin')}</SelectItem>
                  <SelectItem value="teacher">{t('roleOptions.teacher')}</SelectItem>
                  <SelectItem value="student">{t('roleOptions.student')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="institution">{t('fields.institution')}</Label>
              <Select onValueChange={handleInstitutionChange} value={formData.institutionId}>
                <SelectTrigger id="institution">
                  <SelectValue placeholder={t('fields.institutionPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {institutions.map(institution => (
                    <SelectItem key={institution.id} value={institution.id}>
                      {institution.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {formData.role === 'student' && formData.institutionId && (
              <div className="space-y-2">
                <Label htmlFor="class">{t('fields.classOptional')}</Label>
                {classes.filter(cls => cls.institution_id === formData.institutionId).length > 0 ? (
                  <Select onValueChange={handleClassChange} value={formData.classId || '__none__'}>
                    <SelectTrigger id="class">
                      <SelectValue placeholder={t('fields.classPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">{t('fields.noClass')}</SelectItem>
                      {classes
                        .filter(cls => cls.institution_id === formData.institutionId)
                        .map(cls => (
                          <SelectItem key={cls.id} value={cls.id}>
                            {cls.name}
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
                            {t('noClassesEditBody')}
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

            {formData.role === 'teacher' && formData.institutionId && (
              <div className="space-y-2">
                <Label htmlFor="class">{t('fields.classTeachOptional')}</Label>
                {classes.filter(cls => cls.institution_id === formData.institutionId).length > 0 ? (
                  <Select onValueChange={handleClassChange} value={formData.classId || '__none__'}>
                    <SelectTrigger id="class">
                      <SelectValue placeholder={t('fields.classPlaceholderOptional')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">{t('fields.noClass')}</SelectItem>
                      {classes
                        .filter(cls => cls.institution_id === formData.institutionId)
                        .map(cls => (
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
                            {t('noClassesEditBody')}
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
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>{tc('actions.cancel')}</Button>
            <Button onClick={handleUpdateUser}>{t('edit.submit')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog 
        open={showDeleteDialog} 
        onOpenChange={setShowDeleteDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deactivate.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('deactivate.description', { name: selectedUser ? `"${selectedUser.name}"` : t('deactivate.thisAccount') })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc('actions.cancel')}</AlertDialogCancel>
            <Button 
              variant="destructive"
              onClick={handleDeleteUser}
            >
              {t('deactivate.submit')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-[525px]">
          <DialogHeader>
            <DialogTitle>{t('add.title')}</DialogTitle>
            <DialogDescription>
              {t('add.description')}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
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

            <div className="space-y-2 bg-blue-50 p-4 rounded-lg border border-blue-200">
              <Label className="text-blue-800">{t('fields.password')}</Label>
              <p className="text-sm text-blue-600">
                {t('add.passwordHint')}
              </p>
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
              <Select onValueChange={handleRoleChange} value={formData.role}>
                <SelectTrigger id="role">
                  <SelectValue placeholder={t('fields.rolePlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">{t('roleOptions.admin')}</SelectItem>
                  <SelectItem value="school_admin">{t('roleOptions.school_admin')}</SelectItem>
                  <SelectItem value="teacher">{t('roleOptions.teacher')}</SelectItem>
                  <SelectItem value="student">{t('roleOptions.student')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="institution">{t('fields.institutionOptional')}</Label>
              <Select onValueChange={handleInstitutionChange} value={formData.institutionId}>
                <SelectTrigger id="institution">
                  <SelectValue placeholder={t('fields.institutionPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {institutions.map(institution => (
                    <SelectItem key={institution.id} value={institution.id}>
                      {institution.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {formData.role === 'student' && formData.institutionId && (
              <div className="space-y-2">
                <Label htmlFor="class">{t('fields.classOptional')}</Label>
                {classes.filter(cls => cls.institution_id === formData.institutionId).length > 0 ? (
                  <Select onValueChange={handleClassChange} value={formData.classId || '__none__'}>
                    <SelectTrigger id="class">
                      <SelectValue placeholder={t('fields.classPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">{t('fields.noClass')}</SelectItem>
                      {classes
                        .filter(cls => cls.institution_id === formData.institutionId)
                        .map(cls => (
                          <SelectItem key={cls.id} value={cls.id}>
                            {cls.name}
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
                            {t('noClassesCreateBody')}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      💡 <strong>{t('tipLabel')}</strong> {t('tipGoManageBody', { name: institutions.find(i => i.id === formData.institutionId)?.name || t('thisInstitution') })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {formData.role === 'teacher' && formData.institutionId && (
              <div className="space-y-2">
                <Label htmlFor="class">{t('fields.classTeachOptional')}</Label>
                {classes.filter(cls => cls.institution_id === formData.institutionId).length > 0 ? (
                  <Select onValueChange={handleClassChange} value={formData.classId || '__none__'}>
                    <SelectTrigger id="class">
                      <SelectValue placeholder={t('fields.classPlaceholderOptional')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">{t('fields.noClass')}</SelectItem>
                      {classes
                        .filter(cls => cls.institution_id === formData.institutionId)
                        .map(cls => (
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
                            {t('noClassesCreateBody')}
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
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>{tc('actions.cancel')}</Button>
            <Button onClick={handleAddUser} disabled={isLoading}>
              {isLoading ? t('add.submitting') : t('add.submit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de création de classe pour les formulaires d'édition/ajout */}
      <CreateClassDialog
        open={showCreateClassDialog}
        onOpenChange={setShowCreateClassDialog}
        institutionId={formData.institutionId}
        onClassCreated={() => {
          // Rafraîchir la liste des classes après création
          if (formData.institutionId && (formData.role === 'teacher' || formData.role === 'student')) {
            loadClassesByInstitution(formData.institutionId);
          }
          setShowCreateClassDialog(false);
        }}
      />
    </div>
  );
};

export default UsersManagement;
