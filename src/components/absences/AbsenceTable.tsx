
import { useState, useEffect } from 'react';
import { useStrkAbsences } from '@/hooks/useStrkAbsences';
import { useStrkAuth } from '@/hooks/useStrkAuth';
import { StrkAbsence } from '@/services/strkAbsenceService';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Check,
  X,
  Filter,
  Calendar,
  Clock,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

const AbsenceTable = () => {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedAbsence, setSelectedAbsence] = useState<StrkAbsence | null>(null);
  const { toast } = useToast();
  const { user } = useStrkAuth();
  const { absences, isLoading, loadAbsencesByInstitution, loadAbsencesByStudent } = useStrkAbsences();

  useEffect(() => {
    if (user?.role === 'student' && user.id) {
      loadAbsencesByStudent(user.id);
    } else if (user?.institutionId && ['teacher', 'school_admin', 'admin'].includes(user?.role || '')) {
      loadAbsencesByInstitution(user.institutionId);
    }
  }, [user, loadAbsencesByInstitution, loadAbsencesByStudent]);
  
  const filteredAbsences = absences.filter((absence) => {
    // Filtre par type
    const typeMatch = filter === 'all' 
      || (filter === 'absence' && absence.type === 'absence')
      || (filter === 'lateness' && absence.type === 'lateness');
    
    // Filtre par recherche
    const searchLower = search.toLowerCase();
    const studentName = absence.student ? `${absence.student.first_name} ${absence.student.last_name}`.trim() : '';
    const searchMatch = !search 
      || studentName.toLowerCase().includes(searchLower)
      || (absence.class_name && absence.class_name.toLowerCase().includes(searchLower))
      || absence.date.includes(searchLower);
    
    return typeMatch && searchMatch;
  });
  
  const formatDuration = (minutes: number, type: 'absence' | 'lateness') => {
    if (type === 'absence' && minutes >= 360) {
      return 'Journée complète';
    }
    
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    
    if (hours === 0) {
      return `${mins} min`;
    }
    
    return `${hours}h${mins > 0 ? ` ${mins}min` : ''}`;
  };

  const handleShowDetails = (absence: StrkAbsence) => {
    setSelectedAbsence(absence);
  };

  const handleJustifyAbsence = (absenceId: string) => {
    toast({
      title: "Justification ajoutée",
      description: `L'absence ID: ${absenceId} a été marquée comme justifiée.`,
    });
    setSelectedAbsence(null);
  };
  
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-center">
        <div className="relative w-full sm:w-64">
          <Input
            type="text"
            placeholder="Rechercher..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
          <Filter className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
        </div>
        
        <div className="flex items-center space-x-4 w-full sm:w-auto">
          <Select 
            value={filter} 
            onValueChange={setFilter}
          >
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Filtrer par type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les types</SelectItem>
              <SelectItem value="absence">Absences</SelectItem>
              <SelectItem value="lateness">Retards</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      
      <div className="border rounded-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[180px]">Étudiant</TableHead>
              <TableHead>Classe</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Durée</TableHead>
              <TableHead>Justifié</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAbsences.length > 0 ? (
              filteredAbsences.map((absence) => (
                <TableRow key={absence.id}>
                  <TableCell className="font-medium">
                    {absence.student ? `${absence.student.first_name} ${absence.student.last_name}`.trim() : 'Étudiant inconnu'}
                  </TableCell>
                  <TableCell>{absence.class_name || 'Classe non définie'}</TableCell>
                  <TableCell>{absence.date}</TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      absence.type === 'absence' 
                        ? 'bg-red-100 text-red-800' 
                        : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {absence.type === 'absence' ? 'Absence' : 'Retard'}
                      {absence.type === 'lateness' && (
                        <Clock className="ml-1 h-3 w-3" />
                      )}
                    </span>
                  </TableCell>
                  <TableCell>{formatDuration(absence.duration_minutes || 60, absence.type as 'absence' | 'lateness')}</TableCell>
                  <TableCell>
                    {absence.justified ? (
                      <div className="flex items-center">
                        <Check className="text-green-500 h-5 w-5" />
                        <span className="ml-2 text-sm text-gray-500">
                          {absence.justification_reason || 'Justifié'}
                        </span>
                      </div>
                    ) : (
                      <X className="text-red-500 h-5 w-5" />
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-8"
                      onClick={() => handleShowDetails(absence)}
                    >
                      Détails
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                  Aucune absence trouvée
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!selectedAbsence} onOpenChange={() => setSelectedAbsence(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Détails de l'absence</DialogTitle>
          </DialogHeader>
          
          {selectedAbsence && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-500">Étudiant</p>
                  <p>{selectedAbsence.student ? `${selectedAbsence.student.first_name} ${selectedAbsence.student.last_name}`.trim() : 'Étudiant inconnu'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Classe</p>
                  <p>{selectedAbsence.class_name || 'Classe non définie'}</p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-500">Date</p>
                  <p>{selectedAbsence.date}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Type</p>
                  <p>{selectedAbsence.type === 'absence' ? 'Absence' : 'Retard'}</p>
                </div>
              </div>
              
                <div>
                  <p className="text-sm font-medium text-gray-500">Durée</p>
                  <p>{formatDuration(selectedAbsence.duration_minutes, selectedAbsence.type)}</p>
                </div>
              
              <div>
                <p className="text-sm font-medium text-gray-500">État</p>
                <div className="flex items-center mt-1">
                  {selectedAbsence.justified ? (
                    <>
                      <Check className="text-green-500 h-5 w-5" />
                      <span className="ml-2">Justifié: {selectedAbsence.justification_reason || 'Justifié'}</span>
                    </>
                  ) : (
                    <>
                      <X className="text-red-500 h-5 w-5" />
                      <span className="ml-2">Non justifié</span>
                    </>
                  )}
                </div>
              </div>
              
              <div className="flex justify-end space-x-2 pt-4">
                {!selectedAbsence.justified && (
                  <Button 
                    onClick={() => handleJustifyAbsence(selectedAbsence.id)} 
                    className="bg-edusign-600"
                  >
                    Justifier
                  </Button>
                )}
                <Button variant="outline" onClick={() => setSelectedAbsence(null)}>
                  Fermer
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AbsenceTable;
