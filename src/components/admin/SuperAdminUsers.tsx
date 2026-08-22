import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSystemMetrics } from "@/hooks/useSystemMetrics";
import { useToast } from "@/hooks/use-toast";
import { useStrkAuth } from "@/hooks/useStrkAuth";
import { apiClient, ApiError } from '@/lib/apiClient';
import CreateUserDialog from "@/components/admin/CreateUserDialog";
import {
  Users,
  Search,
  Plus,
  Mail,
  Calendar,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  phone_number: string;
  institution_id: string | null;
  created_at: string;
  is_active: boolean;
  strk_institutions?: {
    name: string;
  };
}

type InstitutionOption = { id: string; name: string };

type EditForm = {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  role: string;
  institutionId: string;
};

const EMPTY_INSTITUTION = '__none__';

const SuperAdminUsers = () => {
  const { metrics } = useSystemMetrics();
  const { toast } = useToast();
  const { user: currentUser } = useStrkAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [institutions, setInstitutions] = useState<InstitutionOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('all');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showSuspendDialog, setShowSuspendDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({
    firstName: '',
    lastName: '',
    email: '',
    phoneNumber: '',
    role: 'student',
    institutionId: EMPTY_INSTITUTION,
  });
  const [saving, setSaving] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);

      const [{ users: apiUsers }, { institutions: apiInstitutions }] = await Promise.all([
        apiClient.get<{ users: any[] }>('/users'),
        apiClient.get<{ institutions: any[] }>('/institutions'),
      ]);
      const institutionList: InstitutionOption[] = (apiInstitutions || []).map((i) => ({
        id: i.id,
        name: i.name,
      }));
      setInstitutions(institutionList);
      const institutionById = new Map(institutionList.map((i) => [i.id, i]));

      let filtered = apiUsers;
      if (selectedRole !== 'all') {
        filtered = filtered.filter((u) => u.role === selectedRole);
      }
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        filtered = filtered.filter(
          (u) =>
            u.firstName?.toLowerCase().includes(term) ||
            u.lastName?.toLowerCase().includes(term) ||
            u.email?.toLowerCase().includes(term)
        );
      }

      const mapped: User[] = filtered.slice(0, 100).map((u) => ({
        id: u.id,
        email: u.email,
        first_name: u.firstName,
        last_name: u.lastName,
        role: u.role,
        phone_number: u.phoneNumber,
        institution_id: u.institutionId,
        created_at: u.createdAt,
        is_active: u.isActive !== false,
        strk_institutions: u.institutionId
          ? { name: institutionById.get(u.institutionId)?.name || '—' }
          : undefined,
      }));
      setUsers(mapped);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast({
        title: 'Erreur',
        description: 'Impossible de charger les utilisateurs',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [searchTerm, selectedRole, toast]);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  const getRoleBadge = (role: string) => {
    const roleConfig: Record<string, { label: string; variant: 'destructive' | 'default' | 'secondary' | 'outline' }> = {
      admin: { label: 'Admin', variant: 'destructive' },
      school_admin: { label: 'Admin École', variant: 'default' },
      teacher: { label: 'Enseignant', variant: 'secondary' },
      student: { label: 'Étudiant', variant: 'outline' },
      parent: { label: 'Parent', variant: 'outline' },
    };

    const config = roleConfig[role] || { label: role, variant: 'outline' };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const openEdit = (user: User) => {
    setSelectedUser(user);
    setEditForm({
      firstName: user.first_name || '',
      lastName: user.last_name || '',
      email: user.email || '',
      phoneNumber: user.phone_number || '',
      role: user.role || 'student',
      institutionId: user.institution_id || EMPTY_INSTITUTION,
    });
    setShowEditDialog(true);
  };

  const openSuspend = (user: User) => {
    if (currentUser?.id === user.id) {
      toast({
        title: 'Action impossible',
        description: 'Vous ne pouvez pas suspendre votre propre compte.',
        variant: 'destructive',
      });
      return;
    }
    setSelectedUser(user);
    setShowSuspendDialog(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedUser) return;
    if (!editForm.firstName.trim() || !editForm.lastName.trim() || !editForm.email.trim()) {
      toast({
        title: 'Champs requis',
        description: 'Prénom, nom et e-mail sont obligatoires.',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      await apiClient.patch(`/users/${selectedUser.id}`, {
        firstName: editForm.firstName.trim(),
        lastName: editForm.lastName.trim(),
        email: editForm.email.trim(),
        phoneNumber: editForm.phoneNumber.trim() || undefined,
        role: editForm.role,
      });

      const nextInstitutionId =
        editForm.institutionId === EMPTY_INSTITUTION ? null : editForm.institutionId;
      if (nextInstitutionId && nextInstitutionId !== selectedUser.institution_id) {
        await apiClient.patch(`/users/${selectedUser.id}/institution`, {
          institutionId: nextInstitutionId,
        });
      }

      toast({
        title: 'Utilisateur mis à jour',
        description: `${editForm.firstName} ${editForm.lastName} a été modifié.`,
      });
      setShowEditDialog(false);
      setSelectedUser(null);
      await fetchUsers();
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : 'Impossible de modifier cet utilisateur';
      toast({
        title: 'Erreur',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmSuspend = async () => {
    if (!selectedUser) return;
    setSaving(true);
    try {
      if (selectedUser.is_active) {
        await apiClient.delete(`/users/${selectedUser.id}`);
        toast({
          title: 'Compte suspendu',
          description: `${selectedUser.first_name} ${selectedUser.last_name} a été désactivé.`,
        });
      } else {
        await apiClient.post(`/users/${selectedUser.id}/reactivate`, {});
        toast({
          title: 'Compte réactivé',
          description: `${selectedUser.first_name} ${selectedUser.last_name} est de nouveau actif.`,
        });
      }
      setShowSuspendDialog(false);
      setSelectedUser(null);
      await fetchUsers();
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : 'Impossible de modifier le statut du compte';
      toast({
        title: 'Erreur',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-muted rounded w-1/3"></div>
        <div className="h-64 bg-muted rounded"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Gestion des utilisateurs</h2>
          <p className="text-muted-foreground">
            {metrics.totalUsers} utilisateurs au total
          </p>
        </div>
        <Button type="button" onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nouvel utilisateur
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {Object.entries(metrics.usersByRole).map(([role, count]) => (
          <Card key={role}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">
                    {role === 'school_admin' ? 'Admins École' :
                     role === 'teacher' ? 'Enseignants' :
                     role === 'student' ? 'Étudiants' :
                     role === 'parent' ? 'Parents' : 'Admins'}
                  </p>
                  <p className="text-2xl font-bold">{count}</p>
                </div>
                <Users className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtres et recherche</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex space-x-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Rechercher par nom, email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="px-3 py-2 border border-input rounded-md bg-background"
            >
              <option value="all">Tous les rôles</option>
              <option value="admin">Admin</option>
              <option value="school_admin">Admin École</option>
              <option value="teacher">Enseignant</option>
              <option value="student">Étudiant</option>
              <option value="parent">Parent</option>
            </select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Liste des utilisateurs</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Utilisateur</TableHead>
                <TableHead>Rôle</TableHead>
                <TableHead>Établissement</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Inscription</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div>
                      <div className="font-medium">
                        {user.first_name} {user.last_name}
                      </div>
                      <div className="text-sm text-muted-foreground flex items-center">
                        <Mail className="h-3 w-3 mr-1" />
                        {user.email}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {getRoleBadge(user.role)}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      {user.strk_institutions?.name || (
                        <span className="text-muted-foreground">Aucun</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      {user.phone_number || (
                        <span className="text-muted-foreground">Non renseigné</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={user.is_active ? 'secondary' : 'destructive'}>
                      {user.is_active ? 'Actif' : 'Suspendu'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm flex items-center">
                      <Calendar className="h-3 w-3 mr-1" />
                      {formatDate(user.created_at)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex space-x-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => openEdit(user)}
                      >
                        Modifier
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => openSuspend(user)}
                        disabled={currentUser?.id === user.id && user.is_active}
                      >
                        {user.is_active ? 'Suspendre' : 'Réactiver'}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {users.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Aucun utilisateur trouvé</p>
            </div>
          )}
        </CardContent>
      </Card>

      <CreateUserDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onUserCreated={() => void fetchUsers()}
        defaultRole="school_admin"
      />

      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-[525px]">
          <DialogHeader>
            <DialogTitle>Modifier l’utilisateur</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-firstName">Prénom</Label>
                <Input
                  id="edit-firstName"
                  value={editForm.firstName}
                  onChange={(e) => setEditForm((f) => ({ ...f, firstName: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-lastName">Nom</Label>
                <Input
                  id="edit-lastName"
                  value={editForm.lastName}
                  onChange={(e) => setEditForm((f) => ({ ...f, lastName: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email">E-mail</Label>
              <Input
                id="edit-email"
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-phone">Téléphone</Label>
              <Input
                id="edit-phone"
                type="tel"
                value={editForm.phoneNumber}
                onChange={(e) => setEditForm((f) => ({ ...f, phoneNumber: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Rôle</Label>
              <Select
                value={editForm.role}
                onValueChange={(value) => setEditForm((f) => ({ ...f, role: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choisir un rôle" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="school_admin">Admin École</SelectItem>
                  <SelectItem value="teacher">Enseignant</SelectItem>
                  <SelectItem value="student">Étudiant</SelectItem>
                  <SelectItem value="parent">Parent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Établissement</Label>
              <Select
                value={editForm.institutionId}
                onValueChange={(value) => setEditForm((f) => ({ ...f, institutionId: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choisir un établissement" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={EMPTY_INSTITUTION}>Aucun</SelectItem>
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
            <Button type="button" variant="outline" onClick={() => setShowEditDialog(false)}>
              Annuler
            </Button>
            <Button type="button" onClick={() => void handleSaveEdit()} disabled={saving}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showSuspendDialog} onOpenChange={setShowSuspendDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {selectedUser?.is_active ? 'Suspendre le compte ?' : 'Réactiver le compte ?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {selectedUser?.is_active
                ? `Le compte de ${selectedUser.first_name} ${selectedUser.last_name} sera désactivé et ses sessions seront révoquées.`
                : `Le compte de ${selectedUser?.first_name} ${selectedUser?.last_name} sera réactivé.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleConfirmSuspend()} disabled={saving}>
              {selectedUser?.is_active ? 'Suspendre' : 'Réactiver'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SuperAdminUsers;
