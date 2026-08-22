
import { Button } from '@/components/ui/button';
import { 
  Dialog, 
  DialogContent, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Clock, MapPin } from 'lucide-react';
import { getEventBadge, getEventIcon } from './EventCard';
import { Event } from '@/types/calendar';

interface EventDetailDialogProps {
  event: Event | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: (id: string) => void;
}

const EventDetailDialog = ({ event, open, onOpenChange, onDelete }: EventDetailDialogProps) => {
  if (!event) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            {getEventIcon(event.type)}
            {event.title}
          </DialogTitle>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              {format(event.date, 'EEEE dd MMMM yyyy', { locale: fr })}
            </div>
            <div>{getEventBadge(event.type)}</div>
          </div>
          
          {event.startTime && (
            <div className="flex items-center text-sm">
              <Clock className="h-4 w-4 mr-2 text-gray-500" />
              <span>
                {event.startTime} - {event.endTime}
              </span>
            </div>
          )}
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-gray-500">Classe</p>
              <p>{event.className}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Enseignant</p>
              <p>{event.teacherName}</p>
            </div>
          </div>
          
          {event.location && (
            <div>
              <p className="text-sm font-medium text-gray-500">Lieu</p>
              <div className="flex items-center">
                <MapPin className="h-4 w-4 mr-2 text-gray-500" />
                {event.location}
              </div>
            </div>
          )}
          
          {event.description && (
            <div>
              <p className="text-sm font-medium text-gray-500">Description</p>
              <p className="text-sm">{event.description}</p>
            </div>
          )}
        </div>
        
        <DialogFooter>
          <Button 
            variant="destructive" 
            onClick={() => onDelete(event.id)}
          >
            Supprimer
          </Button>
          <Button onClick={() => onOpenChange(false)}>
            Fermer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EventDetailDialog;
