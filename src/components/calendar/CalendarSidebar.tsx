import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { CalendarCheck, CalendarDays, PlusCircle } from 'lucide-react';
import { format, startOfWeek } from 'date-fns';
import { fr } from 'date-fns/locale';
import { cn } from '@/lib/utils';
interface CalendarSidebarProps {
  date: Date;
  onDateChange: (date: Date) => void;
  onTodayClick: () => void;
  onAddEventClick: () => void;
  hasEvents: (day: Date) => boolean;
}
const CalendarSidebar = ({
  date,
  onDateChange,
  onTodayClick,
  onAddEventClick,
  hasEvents
}: CalendarSidebarProps) => {
  // Custom CSS class for days with events
  const dayWithEventClass = "relative before:absolute before:bottom-1 before:left-1/2 before:-translate-x-1/2 before:w-1.5 before:h-1.5 before:bg-blue-500 before:rounded-full";
  return <Card className="shadow-sm border border-gray-100 px-px">
      <CardHeader className="pb-2 border-b">
        <CardTitle className="text-base flex items-center">
          <CalendarDays className="mr-2 h-4 w-4 text-blue-500" />
          Navigation
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 px-0 py-0">
        <Calendar mode="single" selected={date} onSelect={newDate => newDate && onDateChange(newDate)} locale={fr} modifiers={{
        withEvents: day => hasEvents(day)
      }} modifiersClassNames={{
        withEvents: dayWithEventClass
      }} className="px-[6px] rounded-none bg-gray-50" />
        
        <div className="mt-4 space-y-2 px-[2px]">
          <Button variant="outline" size="sm" className="w-full justify-start text-sm h-8" onClick={onTodayClick}>
            <CalendarCheck className="mr-2 h-4 w-4" />
            Aujourd'hui
          </Button>
          
          <Button variant="outline" size="sm" className="w-full justify-start text-sm h-8" onClick={onAddEventClick}>
            <PlusCircle className="mr-2 h-4 w-4" />
            Nouvel événement
          </Button>
        </div>
        
        <div className="mt-4 pt-4 border-t px-[14px]">
          <h3 className="text-sm font-medium mb-2">Légende</h3>
          <div className="grid grid-cols-2 gap-y-2">
            <div className="flex items-center text-xs">
              <div className="w-3 h-3 rounded-full bg-emerald-500 mr-2"></div>
              <span className="text-gray-700">Cours</span>
            </div>
            <div className="flex items-center text-xs">
              <div className="w-3 h-3 rounded-full bg-orange-500 mr-2"></div>
              <span className="text-gray-700">Examen</span>
            </div>
            <div className="flex items-center text-xs">
              <div className="w-3 h-3 rounded-full bg-blue-500 mr-2"></div>
              <span className="text-gray-700">Réunion</span>
            </div>
            <div className="flex items-center text-xs">
              <div className="w-3 h-3 rounded-full bg-violet-500 mr-2"></div>
              <span className="text-gray-700">Devoir</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>;
};
export default CalendarSidebar;