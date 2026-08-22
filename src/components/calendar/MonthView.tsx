
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { CalendarCheck } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Event } from '@/types/calendar';
import EventCard from './EventCard';

interface MonthViewProps {
  date: Date;
  upcomingEvents: Event[];
  onDateSelect: (date: Date) => void;
  onEventClick: (id: string) => void;
  hasEvents: (day: Date) => boolean;
}

const MonthView = ({ date, upcomingEvents, onDateSelect, onEventClick, hasEvents }: MonthViewProps) => {
  // Custom CSS class for days with events
  const dayWithEventClass = "relative before:absolute before:bottom-1 before:left-1/2 before:-translate-x-1/2 before:w-1.5 before:h-1.5 before:bg-blue-500 before:rounded-full";

  return (
    <Card className="shadow-sm border border-gray-100">
      <CardHeader className="pb-2 bg-white border-b">
        <CardTitle>
          <span className="text-lg font-medium text-green-600 capitalize">
            {format(date, 'MMMM yyyy', { locale: fr })}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg overflow-hidden">
          <Calendar
            mode="single"
            selected={date}
            onSelect={(newDate) => {
              if (newDate) {
                onDateSelect(newDate);
              }
            }}
            locale={fr}
            className={cn("rounded-md border-none", "pointer-events-auto bg-white")}
            modifiers={{
              withEvents: (day) => hasEvents(day)
            }}
            modifiersClassNames={{
              withEvents: dayWithEventClass
            }}
          />
        </div>
        
        <div className="mt-6">
          <h3 className="text-base font-medium mb-3 text-green-600 flex items-center">
            <CalendarCheck className="mr-2 h-4 w-4" />
            Événements à venir
          </h3>
          <div className="space-y-2">
            {upcomingEvents.length > 0 ? (
              upcomingEvents.map(event => (
                <Card 
                  key={event.id} 
                  className="border border-gray-100 hover:shadow-sm transition-shadow cursor-pointer"
                  style={{ borderLeft: `4px solid ${event.color}` }}
                  onClick={() => onEventClick(event.id)}
                >
                  <CardContent className="p-2">
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="flex items-center">
                          {event.title}
                        </div>
                        <div className="text-xs text-gray-500">
                          {format(event.date, 'dd MMM', { locale: fr })}
                          {event.startTime && ` • ${event.startTime}`}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <div className="text-center py-4 bg-gray-50 rounded-lg">
                <p className="text-gray-500">Aucun événement à venir.</p>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default MonthView;
