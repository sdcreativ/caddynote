
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PlusCircle, Search, Edit, Trash } from 'lucide-react';
import { useStrkClasses } from '@/hooks/useStrkClasses';
import { Class, Teacher } from '@/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { CreateClassDialog } from '@/components/admin/CreateClassDialog';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';

interface ClassesTabProps {
  institutionId: string;
}

export const ClassesTab = ({ institutionId }: ClassesTabProps) => {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const { classes, loadClassesByInstitution, removeClass } = useStrkClasses();
  const confirm = useConfirmDialog();

  useEffect(() => {
    if (institutionId) {
      loadClassesByInstitution(institutionId);
    }
  }, [institutionId]);

  const handleDeleteClass = async (classId: string) => {
    const ok = await confirm({
      description: 'Êtes-vous sûr de vouloir supprimer cette classe ?',
      variant: 'destructive',
    });
    if (!ok) return;
    await removeClass(classId);
  };

  // Filtrer les classes par le terme de recherche
  const filteredClasses = classes.filter(cls =>
    (cls.name && cls.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (cls.teacher_name && cls.teacher_name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="relative w-full sm:w-auto">
          <Input
            placeholder="Rechercher une classe..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 w-full sm:w-80"
          />
          <Search className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
        </div>
        
        <Button onClick={() => setShowAddDialog(true)}>
          <PlusCircle className="mr-2 h-5 w-5" />
          Ajouter une classe
        </Button>
      </div>

      {filteredClasses.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom de la classe</TableHead>
              <TableHead>Professeur principal</TableHead>
              <TableHead className="text-center">Nombre d'étudiants</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredClasses.map((classe) => (
              <TableRow key={classe.id}>
                <TableCell className="font-medium">{classe.name}</TableCell>
                <TableCell>{classe.teacher_name || 'Non assigné'}</TableCell>
                <TableCell className="text-center">
                  <Badge variant="secondary">
                    <div>{classe.student_count || 0} étudiants</div>
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="icon" aria-label={`Modifier la classe ${classe.name}`}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-red-600"
                      onClick={() => handleDeleteClass(classe.id)}
                      aria-label={`Supprimer la classe ${classe.name}`}
                    >
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
          <p className="text-gray-500">Aucune classe trouvée. Ajoutez une nouvelle classe.</p>
        </div>
      )}

      <CreateClassDialog 
        open={showAddDialog} 
        onOpenChange={setShowAddDialog}
        institutionId={institutionId}
      />
    </div>
  );
};
