
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export type EventType = 'tous' | 'cours' | 'examen' | 'reunion' | 'devoir';
export type ViewType = 'jour' | 'semaine' | 'mois';

interface CalendarHeaderProps {
  title: string;
  view: ViewType;
  filter: EventType;
  onViewChange: (view: ViewType) => void;
  onFilterChange: (filter: EventType) => void;
  onAddEvent: () => void;
  onNavigate: (direction: 'prev' | 'next') => void;
}

const CalendarHeader = ({
  title,
  view,
  filter,
  onViewChange,
  onFilterChange,
  onAddEvent,
  onNavigate
}: CalendarHeaderProps) => {
  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => onNavigate('prev')} aria-label="Période précédente">
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold text-blue-600">
          {title}
        </h1>
        <Button variant="ghost" size="icon" onClick={() => onNavigate('next')} aria-label="Période suivante">
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>
      
      <div className="flex items-center gap-2">
        <Select value={filter} onValueChange={(value) => onFilterChange(value as EventType)}>
          <SelectTrigger className="w-[150px] h-9 text-sm">
            <SelectValue placeholder="Type d'événement" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tous">Tous les événements</SelectItem>
            <SelectItem value="cours">Cours</SelectItem>
            <SelectItem value="examen">Examens</SelectItem>
            <SelectItem value="reunion">Réunions</SelectItem>
            <SelectItem value="devoir">Devoirs</SelectItem>
          </SelectContent>
        </Select>
        
        <Tabs 
          value={view} 
          onValueChange={(value) => onViewChange(value as ViewType)} 
          className="border rounded-md bg-white"
        >
          <TabsList className="bg-gray-50 p-0 h-9">
            <TabsTrigger 
              value="jour" 
              className="px-3 h-full data-[state=active]:bg-blue-50 data-[state=active]:text-blue-600 rounded-none text-xs"
            >
              Jour
            </TabsTrigger>
            <TabsTrigger 
              value="semaine" 
              className="px-3 h-full data-[state=active]:bg-violet-50 data-[state=active]:text-violet-600 rounded-none text-xs"
            >
              Semaine
            </TabsTrigger>
            <TabsTrigger 
              value="mois" 
              className="px-3 h-full data-[state=active]:bg-green-50 data-[state=active]:text-green-600 rounded-none text-xs"
            >
              Mois
            </TabsTrigger>
          </TabsList>
        </Tabs>
        
        <Button 
          onClick={onAddEvent} 
          size="sm" 
          className="bg-blue-500 hover:bg-blue-600 h-9"
        >
          <Plus className="h-4 w-4 mr-1" />
          Ajouter
        </Button>
      </div>
    </div>
  );
};

export default CalendarHeader;
