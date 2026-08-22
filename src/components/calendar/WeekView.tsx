
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { addDays, format, isSameDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Event } from '@/types/calendar';
import EventCard from './EventCard';

interface WeekViewProps {
  weekStartDate: Date;
  events: Event[];
  onEventClick: (id: string) => void;
}

const WeekView = ({ weekStartDate, events, onEventClick }: WeekViewProps) => {
  // Fonction pour formater le jour de la semaine
  const formatDayName = (date: Date) => {
    return format(date, 'EEE', { locale: fr }).charAt(0).toUpperCase() + format(date, 'EEE', { locale: fr }).slice(1);
  };
  
  // Générer les colonnes de la semaine
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStartDate, i));

  // Rendu des événements pour une date spécifique
  const renderEventsForDate = (currentDate: Date) => {
    const dayEvents = events.filter(event => 
      isSameDay(event.date, currentDate)
    );
    
    if (dayEvents.length === 0) {
      return <div className="text-center text-xs text-gray-400 py-2">Aucun événement</div>;
    }
    
    return dayEvents.map(event => (
      <EventCard
        key={event.id}
        id={event.id}
        title={event.title}
        type={event.type}
        className={event.className}
        teacherName={event.teacherName}
        startTime={event.startTime}
        endTime={event.endTime}
        location={event.location}
        color={event.color || '#10b981'}
        onClick={() => onEventClick(event.id)}
        compact
      />
    ));
  };

  return (
    <Card className="shadow-sm border border-gray-100">
      <CardHeader className="pb-2 bg-white border-b">
        <CardTitle>
          <span className="text-lg font-medium text-violet-600">
            Semaine du {format(weekStartDate, 'dd MMM', { locale: fr })} au {format(addDays(weekStartDate, 6), 'dd MMM yyyy', { locale: fr })}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="grid grid-cols-7 border-b">
          {weekDays.map((day, index) => (
            <div 
              key={index} 
              className={cn(
                "text-center py-2 border-r last:border-r-0",
                isSameDay(day, new Date()) ? "bg-violet-50" : ""
              )}
            >
              <div className="text-xs text-gray-500 uppercase">{formatDayName(day)}</div>
              <div className={cn(
                "text-sm font-medium",
                isSameDay(day, new Date()) ? "text-violet-600" : ""
              )}>
                {format(day, 'dd')}
              </div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 min-h-[450px] max-h-[500px] overflow-auto">
          {weekDays.map((day, index) => (
            <div 
              key={index} 
              className={cn(
                "border-r last:border-r-0 p-1 h-full",
                isSameDay(day, new Date()) ? "bg-violet-50/30" : ""
              )}
            >
              {renderEventsForDate(day)}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default WeekView;
