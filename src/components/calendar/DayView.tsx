
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Event } from '@/types/calendar';
import EventCard from './EventCard';

interface DayViewProps {
  date: Date;
  events: Event[];
  onEventClick: (id: string) => void;
}

const DayView = ({ date, events, onEventClick }: DayViewProps) => {
  return (
    <Card className="shadow-sm border border-gray-100">
      <CardHeader className="pb-2 bg-white border-b">
        <CardTitle>
          <span className="text-lg font-medium text-blue-600 capitalize">
            {format(date, 'EEEE dd MMMM yyyy', { locale: fr })}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4">
        {events.length > 0 ? (
          <div className="space-y-2">
            {events.map((event) => (
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
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-10 bg-gray-50 rounded-lg">
            <CalendarIcon className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 mb-3">Aucun événement ce jour.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default DayView;
