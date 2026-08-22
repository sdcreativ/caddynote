import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Search, UserMinus, UserPlus, Users } from 'lucide-react';
import { useStrkClasses } from '@/hooks/useStrkClasses';
import { apiClient } from '@/lib/apiClient';
import { useToast } from '@/hooks/use-toast';

interface ClassStudentsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classData: {
    id: string;
    name?: string;
    institution_id?: string;
    institutionId?: string;
  } | null;
  onChanged?: () => void;
}

type StudentRow = {
  id: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone_number?: string | null;
  profile_image?: string | null;
};

export const ClassStudentsDialog = ({
  open,
  onOpenChange,
  classData,
  onChanged,
}: ClassStudentsDialogProps) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [availableStudents, setAvailableStudents] = useState<StudentRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { assignStudents, removeStudent } = useStrkClasses();

  const institutionId = classData?.institution_id || classData?.institutionId;

  const getInitials = (name: string): string =>
    name
      .split(' ')
      .map((part) => part.charAt(0))
      .join('')
      .toUpperCase()
      .substring(0, 2);

  const mapProfile = (u: any): StudentRow => ({
    id: u.id,
    first_name: u.profile?.firstName || u.firstName || u.first_name || '',
    last_name: u.profile?.lastName || u.lastName || u.last_name || '',
    email: u.profile?.email || u.email,
    phone_number: u.profile?.phoneNumber ?? u.phoneNumber ?? u.phone_number,
    profile_image: u.profile?.profileImage ?? u.profileImage ?? u.profile_image,
  });

  const reload = async () => {
    if (!classData?.id || !institutionId) return;
    setIsLoading(true);
    try {
      const [{ students: inClass }, { users }] = await Promise.all([
        apiClient.get<{ students: any[] }>(`/classes/${classData.id}/students`),
        apiClient.get<{ users: any[] }>(
          `/users?institutionId=${encodeURIComponent(institutionId)}`
        ),
      ]);
      const current = (inClass || []).map(mapProfile);
      setStudents(current);
      const currentIds = new Set(current.map((s) => s.id));
      const available = (users || [])
        .filter((u) => u.role === 'student' && !currentIds.has(u.id))
        .map(mapProfile);
      setAvailableStudents(available);
    } catch (error) {
      console.error('Error loading class students:', error);
      toast({
        title: 'Erreur',
        description: 'Impossible de charger les élèves de la classe',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (open && classData?.id) {
      void reload();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, classData?.id, institutionId]);

  const handleAssignStudent = async (studentId: string) => {
    if (!classData?.id) return;
    const success = await assignStudents(classData.id, [studentId]);
    if (success) {
      toast({ title: 'Élève affecté' });
      await reload();
      onChanged?.();
    } else {
      toast({ title: 'Affectation impossible', variant: 'destructive' });
    }
  };

  const handleRemoveStudent = async (studentId: string) => {
    if (!classData?.id) return;
    const success = await removeStudent(classData.id, studentId);
    if (success) {
      toast({ title: 'Élève retiré' });
      await reload();
      onChanged?.();
    } else {
      toast({ title: 'Retrait impossible', variant: 'destructive' });
    }
  };

  const filteredStudents = students.filter(
    (student) =>
      `${student.first_name} ${student.last_name}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      student.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredAvailableStudents = availableStudents.filter(
    (student) =>
      `${student.first_name} ${student.last_name}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      student.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Gestion des élèves — {classData?.name}
          </DialogTitle>
          <DialogDescription>Affectez ou retirez des élèves de cette classe.</DialogDescription>
        </DialogHeader>

        {!institutionId ? (
          <p className="text-sm text-destructive">
            Établissement manquant pour cette classe — rechargez la page.
          </p>
        ) : (
          <div className="space-y-6 py-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Rechercher des élèves…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">Élèves actuels</h3>
                <Badge variant="secondary">{students.length} élèves</Badge>
              </div>

              {isLoading ? (
                <p className="text-sm text-muted-foreground">Chargement…</p>
              ) : filteredStudents.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Élève</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Téléphone</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredStudents.map((student) => (
                      <TableRow key={student.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar>
                              <AvatarImage
                                src={student.profile_image || undefined}
                                alt={`${student.first_name} ${student.last_name}`}
                              />
                              <AvatarFallback>
                                {getInitials(`${student.first_name} ${student.last_name}`)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="font-medium">
                              {student.first_name} {student.last_name}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{student.email}</TableCell>
                        <TableCell>{student.phone_number || 'Non renseigné'}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => void handleRemoveStudent(student.id)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <UserMinus className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="py-8 text-center text-muted-foreground">
                  <Users className="mx-auto mb-2 h-8 w-8 opacity-50" />
                  <p>Aucun élève dans cette classe</p>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">Élèves disponibles</h3>
                <Badge variant="outline">{availableStudents.length} disponibles</Badge>
              </div>

              {filteredAvailableStudents.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Élève</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Téléphone</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAvailableStudents.map((student) => (
                      <TableRow key={student.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar>
                              <AvatarImage
                                src={student.profile_image || undefined}
                                alt={`${student.first_name} ${student.last_name}`}
                              />
                              <AvatarFallback>
                                {getInitials(`${student.first_name} ${student.last_name}`)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="font-medium">
                              {student.first_name} {student.last_name}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{student.email}</TableCell>
                        <TableCell>{student.phone_number || 'Non renseigné'}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => void handleAssignStudent(student.id)}
                            className="text-green-600 hover:text-green-700"
                          >
                            <UserPlus className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="py-8 text-center text-muted-foreground">
                  <UserPlus className="mx-auto mb-2 h-8 w-8 opacity-50" />
                  <p>Aucun élève disponible dans l’établissement</p>
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Fermer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
