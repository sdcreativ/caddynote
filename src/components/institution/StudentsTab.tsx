
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PlusCircle, Search, Edit, Trash, Eye } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Student, Class } from '@/types';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface StudentsTabProps {
  students: Student[];
  institutionId: string;
  classes: Class[];
}

export const StudentsTab = ({ students, institutionId, classes }: StudentsTabProps) => {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [classFilter, setClassFilter] = useState('all');
  const { toast } = useToast();

  const handleAddStudent = () => {
    toast({
      title: "Étudiant ajouté",
      description: "Le nouvel étudiant a été ajouté avec succès.",
    });
    setShowAddDialog(false);
  };

  // Filtrer les étudiants par terme de recherche et classe
  const filteredStudents = students.filter(student => 
    (student.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
     student.email.toLowerCase().includes(searchTerm.toLowerCase())) &&
    (classFilter === 'all' || student.class === classFilter)
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 flex-wrap">
        <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
          <div className="relative w-full sm:w-80">
            <Input
              placeholder="Rechercher un étudiant..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
            <Search className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
          </div>
          
          <Select
            value={classFilter}
            onValueChange={setClassFilter}
          >
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Filtrer par classe" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les classes</SelectItem>
              {classes.map(cls => (
                <SelectItem key={cls.id} value={cls.name}>{cls.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <Button onClick={() => setShowAddDialog(true)} className="whitespace-nowrap">
          <PlusCircle className="mr-2 h-5 w-5" />
          Ajouter un étudiant
        </Button>
      </div>

      {filteredStudents.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Classe</TableHead>
              <TableHead className="text-center">Taux de présence</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredStudents.map((student) => (
              <TableRow key={student.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarImage src={student.profileImage} />
                      <AvatarFallback>{student.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <span className="font-medium">{student.name}</span>
                  </div>
                </TableCell>
                <TableCell>{student.email}</TableCell>
                <TableCell>{student.class}</TableCell>
                <TableCell className="text-center">
                  <Badge variant={(student.attendanceRate ?? 0) >= 90 ? "success" :
                              (student.attendanceRate ?? 0) >= 75 ? "default" : "destructive"}
                  >
                    {student.attendanceRate ?? 0}%
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="icon" aria-label={`Voir la fiche de ${student.name}`}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" aria-label={`Modifier ${student.name}`}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-red-600" aria-label={`Supprimer ${student.name}`}>
                      <Trash className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <div className="text-center py-12 border border-dashed rounded-lg">
          <p className="text-gray-500">
            Aucun étudiant trouvé. {classFilter !== 'all' ? "Essayez de changer le filtre ou " : ""}
            Ajoutez un nouvel étudiant.
          </p>
        </div>
      )}

      {/* Dialogue pour ajouter un nouvel étudiant */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-[525px]">
          <DialogHeader>
            <DialogTitle>Ajouter un nouvel étudiant</DialogTitle>
            <DialogDescription>
              Entrez les informations du nouvel étudiant
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">Prénom</Label>
                <Input id="firstName" placeholder="Prénom" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Nom</Label>
                <Input id="lastName" placeholder="Nom" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="email@example.com" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="class">Classe</Label>
              <Select>
                <SelectTrigger id="class">
                  <SelectValue placeholder="Sélectionner une classe" />
                </SelectTrigger>
                <SelectContent>
                  {classes.map(cls => (
                    <SelectItem key={cls.id} value={cls.name}>{cls.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Annuler
            </Button>
            <Button onClick={handleAddStudent}>
              Ajouter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
