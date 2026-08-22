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
import { useStudentStats, type StudentRow } from '@/hooks/useStudentStats';
import { useToast } from '@/hooks/use-toast';
import { apiClient, ApiError } from '@/lib/apiClient';
import { BookOpen, Building2, Calendar, Mail, Search, UserCheck } from 'lucide-react';

const EMPTY_INSTITUTION = '__none__';

const SuperAdminStudents = () => {
  const { stats, loading, error, refetch } = useStudentStats();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDossier, setShowDossier] = useState(false);
  const [selected, setSelected] = useState<StudentRow | null>(null);
  const [dossier, setDossier] = useState<any | null>(null);
  const [institutions, setInstitutions] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phoneNumber: '',
    institutionId: EMPTY_INSTITUTION,
  });

  const filteredStudents = stats.studentsWithClasses.filter((student) => {
    const q = searchTerm.toLowerCase();
    return (
      `${student.firstName} ${student.lastName}`.toLowerCase().includes(q) ||
      student.email?.toLowerCase().includes(q) ||
      (student.institutionName || '').toLowerCase().includes(q)
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

  const openEdit = async (student: StudentRow) => {
    setSelected(student);
    setEditForm({
      firstName: student.firstName,
      lastName: student.lastName,
      email: student.email,
      phoneNumber: student.phoneNumber || '',
      institutionId: student.institutionId || EMPTY_INSTITUTION,
    });
    try {
      const { institutions: list } = await apiClient.get<{ institutions: any[] }>('/institutions');
      setInstitutions((list || []).map((i) => ({ id: i.id, name: i.name })));
    } catch {
      setInstitutions([]);
    }
    setShowEdit(true);
  };

  const openDossier = async (student: StudentRow) => {
    setSelected(student);
    setShowDossier(true);
    setDossier(null);
    try {
      const { student: detail } = await apiClient.get<{ student: any }>(`/students/${student.id}`);
      setDossier(detail);
    } catch (e) {
      toast({
        title: 'Erreur',
        description: e instanceof ApiError ? e.message : 'Dossier inaccessible',
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
      toast({ title: 'Élève mis à jour' });
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
        <h2 className="text-xl font-semibold">Gestion des élèves</h2>
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
          <h2 className="text-2xl font-bold">Gestion des élèves</h2>
          <p className="text-muted-foreground">{stats.totalStudents} élèves au total</p>
        </div>
        <Button type="button" onClick={() => setShowCreate(true)}>
          <UserCheck className="h-4 w-4 mr-2" />
          Nouvel élève
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total Élèves</p>
              <p className="text-2xl font-bold">{stats.totalStudents}</p>
            </div>
            <UserCheck className="h-8 w-8 text-muted-foreground" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Institutions</p>
              <p className="text-2xl font-bold">{Object.keys(stats.studentsByInstitution).length}</p>
            </div>
            <Building2 className="h-8 w-8 text-muted-foreground" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Taux présence moyen</p>
              <p className="text-2xl font-bold">
                {stats.averageAttendanceRate != null ? `${stats.averageAttendanceRate}%` : '—'}
              </p>
              {stats.averageAttendanceRate == null && (
                <p className="text-xs text-muted-foreground">Aucune donnée d’assiduité</p>
              )}
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
          <CardTitle>Liste des élèves</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Élève</TableHead>
                <TableHead>Institution</TableHead>
                <TableHead>Classe</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Inscription</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredStudents.map((student) => (
                <TableRow key={student.id}>
                  <TableCell>
                    <div className="font-medium">
                      {student.firstName} {student.lastName}
                    </div>
                    <div className="text-sm text-muted-foreground flex items-center">
                      <Mail className="h-3 w-3 mr-1" />
                      {student.email || '—'}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {student.institutionName || (
                      <span className="text-muted-foreground">Aucune</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {student.className ? (
                      <Badge variant="secondary">{student.className}</Badge>
                    ) : (
                      <span className="text-sm text-muted-foreground">Aucune classe</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {student.phoneNumber || (
                      <span className="text-muted-foreground">Non renseigné</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm flex items-center">
                    <Calendar className="h-3 w-3 mr-1" />
                    {formatDate(student.createdAt)}
                  </TableCell>
                  <TableCell>
                    <div className="flex space-x-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => void openEdit(student)}>
                        Modifier
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => void openDossier(student)}>
                        Dossier
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {filteredStudents.length === 0 && (
            <div className="py-8 text-center text-muted-foreground">
              <UserCheck className="mx-auto mb-2 h-8 w-8 opacity-50" />
              <p>Aucun élève trouvé</p>
            </div>
          )}
        </CardContent>
      </Card>

      <CreateUserDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onUserCreated={() => void refetch()}
        defaultRole="student"
      />

      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier l’élève</DialogTitle>
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

      <Dialog open={showDossier} onOpenChange={setShowDossier}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Dossier — {selected?.firstName} {selected?.lastName}
            </DialogTitle>
          </DialogHeader>
          {!dossier ? (
            <p className="text-sm text-muted-foreground">Chargement…</p>
          ) : (
            <div className="space-y-2 text-sm">
              <p>
                <span className="text-muted-foreground">E-mail : </span>
                {dossier.profile?.email || '—'}
              </p>
              <p>
                <span className="text-muted-foreground">Établissement : </span>
                {dossier.institution?.name || selected?.institutionName || '—'}
              </p>
              <p>
                <span className="text-muted-foreground">Classe : </span>
                {dossier.class?.name || '—'}
              </p>
              <p>
                <span className="text-muted-foreground">N° élève : </span>
                {dossier.studentNumber || '—'}
              </p>
              <p>
                <span className="text-muted-foreground">Assiduité : </span>
                {dossier.attendanceRate != null ? `${Number(dossier.attendanceRate)}%` : '—'}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SuperAdminStudents;
