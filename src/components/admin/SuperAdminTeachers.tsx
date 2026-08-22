import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import CreateUserDialog from '@/components/admin/CreateUserDialog';
import { useTeacherStats, type TeacherRow } from '@/hooks/useTeacherStats';
import { useToast } from '@/hooks/use-toast';
import { apiClient, ApiError } from '@/lib/apiClient';
import { BookOpen, Building2, Calendar, GraduationCap, Mail, Search } from 'lucide-react';

const EMPTY_INSTITUTION = '__none__';

const SuperAdminTeachers = () => {
  const { stats, loading, error, refetch } = useTeacherStats();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showClasses, setShowClasses] = useState(false);
  const [selected, setSelected] = useState<TeacherRow | null>(null);
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [institutions, setInstitutions] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phoneNumber: '',
    institutionId: EMPTY_INSTITUTION,
  });

  const filteredTeachers = stats.teachersWithClasses.filter((teacher) => {
    const q = searchTerm.toLowerCase();
    return (
      `${teacher.firstName} ${teacher.lastName}`.toLowerCase().includes(q) ||
      teacher.email?.toLowerCase().includes(q) ||
      (teacher.institutionName || '').toLowerCase().includes(q)
    );
  });

  const formatDate = (dateString?: string) => {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const openEdit = async (teacher: TeacherRow) => {
    setSelected(teacher);
    setEditForm({
      firstName: teacher.firstName,
      lastName: teacher.lastName,
      email: teacher.email,
      phoneNumber: teacher.phoneNumber || '',
      institutionId: teacher.institutionId || EMPTY_INSTITUTION,
    });
    try {
      const { institutions: list } = await apiClient.get<{ institutions: any[] }>('/institutions');
      setInstitutions((list || []).map((i) => ({ id: i.id, name: i.name })));
    } catch {
      setInstitutions([]);
    }
    setShowEdit(true);
  };

  const openClasses = async (teacher: TeacherRow) => {
    setSelected(teacher);
    setShowClasses(true);
    try {
      const { classes: list } = await apiClient.get<{ classes: any[] }>(
        `/classes?teacherId=${encodeURIComponent(teacher.id)}`
      );
      setClasses((list || []).map((c) => ({ id: c.id, name: c.name })));
    } catch {
      setClasses([]);
      toast({
        title: 'Erreur',
        description: 'Impossible de charger les classes',
        variant: 'destructive',
      });
    }
  };

  const saveEdit = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await apiClient.patch(`/users/${selected.id}`, {
        firstName: editForm.firstName.trim(),
        lastName: editForm.lastName.trim(),
        email: editForm.email.trim(),
        phoneNumber: editForm.phoneNumber.trim() || undefined,
      });
      if (
        editForm.institutionId !== EMPTY_INSTITUTION &&
        editForm.institutionId !== selected.institutionId
      ) {
        await apiClient.patch(`/users/${selected.id}/institution`, {
          institutionId: editForm.institutionId,
        });
      }
      toast({ title: 'Enseignant mis à jour' });
      setShowEdit(false);
      await refetch();
    } catch (e) {
      toast({
        title: 'Erreur',
        description: e instanceof ApiError ? e.message : 'Modification impossible',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-muted rounded w-1/3" />
        <div className="h-64 bg-muted rounded" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4 rounded-lg border border-destructive/30 bg-destructive/5 p-6">
        <h2 className="text-xl font-semibold">Gestion des enseignants</h2>
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button type="button" variant="outline" onClick={() => void refetch()}>
          Réessayer
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Gestion des enseignants</h2>
          <p className="text-muted-foreground">{stats.totalTeachers} enseignants au total</p>
        </div>
        <Button type="button" onClick={() => setShowCreate(true)}>
          <GraduationCap className="h-4 w-4 mr-2" />
          Nouvel enseignant
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total Enseignants</p>
              <p className="text-2xl font-bold">{stats.totalTeachers}</p>
            </div>
            <GraduationCap className="h-8 w-8 text-muted-foreground" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Institutions</p>
              <p className="text-2xl font-bold">{Object.keys(stats.teachersByInstitution).length}</p>
            </div>
            <Building2 className="h-8 w-8 text-muted-foreground" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Moyenne Classes</p>
              <p className="text-2xl font-bold">
                {stats.teachersWithClasses.length > 0
                  ? Math.round(
                      stats.teachersWithClasses.reduce((sum, t) => sum + t.classCount, 0) /
                        stats.teachersWithClasses.length
                    )
                  : 0}
              </p>
            </div>
            <BookOpen className="h-8 w-8 text-muted-foreground" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recherche</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-10"
              placeholder="Rechercher par nom, email, établissement…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Liste des enseignants</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Enseignant</TableHead>
                <TableHead>Institution</TableHead>
                <TableHead>Classes</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Inscription</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTeachers.map((teacher) => (
                <TableRow key={teacher.id}>
                  <TableCell>
                    <div className="font-medium">
                      {teacher.firstName} {teacher.lastName}
                    </div>
                    <div className="text-sm text-muted-foreground flex items-center">
                      <Mail className="h-3 w-3 mr-1" />
                      {teacher.email}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {teacher.institutionName || (
                      <span className="text-muted-foreground">Aucune</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{teacher.classCount} classes</Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {teacher.phoneNumber || (
                      <span className="text-muted-foreground">Non renseigné</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm flex items-center">
                    <Calendar className="h-3 w-3 mr-1" />
                    {formatDate(teacher.createdAt)}
                  </TableCell>
                  <TableCell>
                    <div className="flex space-x-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => void openEdit(teacher)}>
                        Modifier
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => void openClasses(teacher)}>
                        Classes
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {filteredTeachers.length === 0 && (
            <div className="py-8 text-center text-muted-foreground">
              <GraduationCap className="mx-auto mb-2 h-8 w-8 opacity-50" />
              <p>Aucun enseignant trouvé</p>
            </div>
          )}
        </CardContent>
      </Card>

      <CreateUserDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onUserCreated={() => void refetch()}
        defaultRole="teacher"
      />

      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier l’enseignant</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Prénom</Label>
                <Input
                  value={editForm.firstName}
                  onChange={(e) => setEditForm((f) => ({ ...f, firstName: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Nom</Label>
                <Input
                  value={editForm.lastName}
                  onChange={(e) => setEditForm((f) => ({ ...f, lastName: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>E-mail</Label>
              <Input
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Téléphone</Label>
              <Input
                value={editForm.phoneNumber}
                onChange={(e) => setEditForm((f) => ({ ...f, phoneNumber: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Établissement</Label>
              <Select
                value={editForm.institutionId}
                onValueChange={(v) => setEditForm((f) => ({ ...f, institutionId: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choisir…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={EMPTY_INSTITUTION}>Aucun</SelectItem>
                  {institutions.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowEdit(false)}>
              Annuler
            </Button>
            <Button type="button" disabled={saving} onClick={() => void saveEdit()}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showClasses} onOpenChange={setShowClasses}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Classes — {selected?.firstName} {selected?.lastName}
            </DialogTitle>
          </DialogHeader>
          {classes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune classe assignée.</p>
          ) : (
            <ul className="space-y-2">
              {classes.map((c) => (
                <li key={c.id} className="rounded border px-3 py-2 text-sm">
                  {c.name}
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SuperAdminTeachers;
