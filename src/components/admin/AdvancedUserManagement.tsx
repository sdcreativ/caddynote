import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { useStrkAuth } from '@/hooks/useStrkAuth';
import { apiClient, ApiError } from '@/lib/apiClient';
import {
  Ban,
  Download,
  RefreshCw,
  Search,
  UserCheck,
  UserCog,
  Users,
} from 'lucide-react';

type ManagedUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  phoneNumber?: string | null;
  institutionId?: string | null;
  institutionName?: string;
  createdAt: string;
  isActive: boolean;
};

type BulkKind = 'suspend' | 'activate' | 'change_role' | 'assign_institution';

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin' },
  { value: 'school_admin', label: 'Admin École' },
  { value: 'teacher', label: 'Enseignant' },
  { value: 'student', label: 'Étudiant' },
  { value: 'parent', label: 'Parent' },
] as const;

const AdvancedUserManagement = () => {
  const { t } = useTranslation('superAdmin');
  const { toast } = useToast();
  const { user: currentUser } = useStrkAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [institutions, setInstitutions] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [bulkKind, setBulkKind] = useState<BulkKind | null>(null);
  const [bulkRole, setBulkRole] = useState('teacher');
  const [bulkInstitutionId, setBulkInstitutionId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ users: apiUsers }, { institutions: apiInstitutions }] = await Promise.all([
        apiClient.get<{ users: any[] }>('/users'),
        apiClient.get<{ institutions: any[] }>('/institutions'),
      ]);
      const institutionList = (apiInstitutions || []).map((i) => ({ id: i.id, name: i.name }));
      setInstitutions(institutionList);
      const byId = new Map(institutionList.map((i) => [i.id, i.name]));

      setUsers(
        (apiUsers || []).map((u) => ({
          id: u.id,
          email: u.email || '',
          firstName: u.firstName || '',
          lastName: u.lastName || '',
          role: u.role,
          phoneNumber: u.phoneNumber,
          institutionId: u.institutionId,
          institutionName: u.institutionId ? byId.get(u.institutionId) : undefined,
          createdAt: u.createdAt,
          isActive: u.isActive !== false,
        }))
      );
      setSelectedIds([]);
    } catch (error) {
      toast({
        title: 'Chargement impossible',
        description: error instanceof ApiError ? error.message : 'Erreur réseau',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredUsers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (statusFilter === 'active' && !u.isActive) return false;
      if (statusFilter === 'suspended' && u.isActive) return false;
      if (!term) return true;
      return (
        u.firstName.toLowerCase().includes(term) ||
        u.lastName.toLowerCase().includes(term) ||
        u.email.toLowerCase().includes(term) ||
        (u.institutionName || '').toLowerCase().includes(term)
      );
    });
  }, [users, searchTerm, roleFilter, statusFilter]);

  const selectableIds = useMemo(
    () => filteredUsers.filter((u) => u.id !== currentUser?.id).map((u) => u.id),
    [filteredUsers, currentUser?.id]
  );

  const allVisibleSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selectedIds.includes(id));

  const toggleAllVisible = (checked: boolean) => {
    if (checked) {
      setSelectedIds((prev) => [...new Set([...prev, ...selectableIds])]);
    } else {
      setSelectedIds((prev) => prev.filter((id) => !selectableIds.includes(id)));
    }
  };

  const toggleOne = (userId: string, checked: boolean) => {
    if (userId === currentUser?.id) return;
    setSelectedIds((prev) =>
      checked ? [...new Set([...prev, userId])] : prev.filter((id) => id !== userId)
    );
  };

  const roleLabel = (role: string) =>
    ROLE_OPTIONS.find((r) => r.value === role)?.label || role;

  const exportCsv = () => {
    const source = selectedIds.length
      ? users.filter((u) => selectedIds.includes(u.id))
      : filteredUsers;
    const header = ['Prenom', 'Nom', 'Email', 'Role', 'Statut', 'Etablissement', 'Inscription'];
    const rows = source.map((u) => [
      u.firstName,
      u.lastName,
      u.email,
      u.role,
      u.isActive ? 'actif' : 'suspendu',
      u.institutionName || '',
      u.createdAt?.slice(0, 10) || '',
    ]);
    const csv = [header, ...rows]
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
      .join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `utilisateurs-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast({
      title: 'Export CSV',
      description: `${source.length} ligne(s) exportée(s).`,
    });
  };

  const runBulk = async () => {
    if (!bulkKind || selectedIds.length === 0) return;
    if (bulkKind === 'change_role' && !bulkRole) return;
    if (bulkKind === 'assign_institution' && !bulkInstitutionId) {
      toast({
        title: 'Établissement requis',
        description: 'Choisissez un établissement cible.',
        variant: 'destructive',
      });
      return;
    }

    setBusy(true);
    try {
      const results = await Promise.allSettled(
        selectedIds.map(async (id) => {
          if (bulkKind === 'suspend') {
            await apiClient.delete(`/users/${id}`);
            return;
          }
          if (bulkKind === 'activate') {
            await apiClient.post(`/users/${id}/reactivate`, {});
            return;
          }
          if (bulkKind === 'change_role') {
            await apiClient.patch(`/users/${id}`, { role: bulkRole });
            return;
          }
          await apiClient.patch(`/users/${id}/institution`, {
            institutionId: bulkInstitutionId,
          });
        })
      );

      const ok = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.length - ok;
      toast({
        title: failed ? 'Action partielle' : 'Action terminée',
        description: `${ok} réussie(s)${failed ? `, ${failed} échec(s)` : ''}.`,
        variant: failed ? 'destructive' : 'default',
      });
      setBulkKind(null);
      await load();
    } catch (error) {
      toast({
        title: 'Échec',
        description: error instanceof ApiError ? error.message : 'Impossible d’exécuter l’action',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const confirmCopy = () => {
    const n = selectedIds.length;
    switch (bulkKind) {
      case 'suspend':
        return `Suspendre ${n} compte(s) ? Les sessions actives seront révoquées.`;
      case 'activate':
        return `Réactiver ${n} compte(s) ?`;
      case 'change_role':
        return `Attribuer le rôle « ${roleLabel(bulkRole)} » à ${n} utilisateur(s) ?`;
      case 'assign_institution': {
        const name = institutions.find((i) => i.id === bulkInstitutionId)?.name || 'cet établissement';
        return `Rattacher ${n} utilisateur(s) à « ${name} » ?`;
      }
      default:
        return '';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold">{t('advancedUsersPage.title')}</h2>
          <p className="text-muted-foreground">{t('advancedUsersPage.subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Actualiser
          </Button>
          <Button type="button" variant="outline" onClick={exportCsv}>
            <Download className="mr-2 h-4 w-4" />
            Exporter CSV
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm text-muted-foreground">{t('advancedUsersPage.visibleAccounts')}</p>
              <p className="text-2xl font-bold">{filteredUsers.length}</p>
            </div>
            <Users className="h-8 w-8 text-muted-foreground" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm text-muted-foreground">Sélection</p>
              <p className="text-2xl font-bold">{selectedIds.length}</p>
            </div>
            <UserCog className="h-8 w-8 text-muted-foreground" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm text-muted-foreground">Suspendus (filtre)</p>
              <p className="text-2xl font-bold">
                {filteredUsers.filter((u) => !u.isActive).length}
              </p>
            </div>
            <Ban className="h-8 w-8 text-muted-foreground" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtres</CardTitle>
          <CardDescription>Affinez la liste avant de sélectionner des comptes.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 md:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-10"
              placeholder="Rechercher nom, e-mail, établissement…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-full md:w-[180px]">
              <SelectValue placeholder="Rôle" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les rôles</SelectItem>
              {ROLE_OPTIONS.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full md:w-[180px]">
              <SelectValue placeholder="Statut" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              <SelectItem value="active">Actifs</SelectItem>
              <SelectItem value="suspended">Suspendus</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Actions en masse</CardTitle>
          <CardDescription>
            Sélectionnez au moins un compte (hors le vôtre), puis lancez une action.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="space-y-2">
            <Label>Nouveau rôle</Label>
            <Select value={bulkRole} onValueChange={setBulkRole}>
              <SelectTrigger className="w-full lg:w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Établissement cible</Label>
            <Select value={bulkInstitutionId} onValueChange={setBulkInstitutionId}>
              <SelectTrigger className="w-full lg:w-[240px]">
                <SelectValue placeholder="Choisir…" />
              </SelectTrigger>
              <SelectContent>
                {institutions.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={selectedIds.length === 0 || busy}
              onClick={() => setBulkKind('suspend')}
            >
              <Ban className="mr-2 h-4 w-4" />
              Suspendre
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={selectedIds.length === 0 || busy}
              onClick={() => setBulkKind('activate')}
            >
              <UserCheck className="mr-2 h-4 w-4" />
              Réactiver
            </Button>
            <Button
              type="button"
              disabled={selectedIds.length === 0 || busy}
              onClick={() => setBulkKind('change_role')}
            >
              Changer le rôle
            </Button>
            <Button
              type="button"
              disabled={selectedIds.length === 0 || busy || !bulkInstitutionId}
              onClick={() => setBulkKind('assign_institution')}
            >
              Rattacher établissement
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('advancedUsersPage.listTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3 animate-pulse">
              <div className="h-10 rounded bg-muted" />
              <div className="h-48 rounded bg-muted" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allVisibleSelected}
                      onCheckedChange={(v) => toggleAllVisible(v === true)}
                      aria-label="Tout sélectionner"
                    />
                  </TableHead>
                  <TableHead>Utilisateur</TableHead>
                  <TableHead>Rôle</TableHead>
                  <TableHead>Établissement</TableHead>
                  <TableHead>Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => {
                  const isSelf = user.id === currentUser?.id;
                  return (
                    <TableRow key={user.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.includes(user.id)}
                          disabled={isSelf}
                          onCheckedChange={(v) => toggleOne(user.id, v === true)}
                          aria-label={`Sélectionner ${user.email}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">
                          {user.firstName} {user.lastName}
                          {isSelf ? (
                            <span className="ml-2 text-xs text-muted-foreground">(vous)</span>
                          ) : null}
                        </div>
                        <div className="text-sm text-muted-foreground">{user.email}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{roleLabel(user.role)}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {user.institutionName || (
                          <span className="text-muted-foreground">Aucun</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={user.isActive ? 'secondary' : 'destructive'}>
                          {user.isActive ? 'Actif' : 'Suspendu'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}

          {!loading && filteredUsers.length === 0 && (
            <div className="py-8 text-center text-muted-foreground">
              Aucun utilisateur ne correspond aux filtres.
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={bulkKind !== null} onOpenChange={(open) => !open && setBulkKind(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer l’action en masse</AlertDialogTitle>
            <AlertDialogDescription>{confirmCopy()}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Annuler</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={() => void runBulk()}>
              {busy ? 'Exécution…' : 'Confirmer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdvancedUserManagement;
