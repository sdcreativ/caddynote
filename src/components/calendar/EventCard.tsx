
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Book, BookOpen, Clock, FileText, MapPin, Users } from 'lucide-react';

interface EventCardProps {
  id: string;
  title: string;
  type: 'cours' | 'examen' | 'reunion' | 'devoir';
  className: string;
  teacherName: string;
  startTime?: string;
  endTime?: string;
  location?: string;
  color: string;
  onClick: () => void;
  compact?: boolean;
}

export function getEventIcon(type: string) {
  switch(type) {
    case 'cours':
      return <BookOpen className="h-4 w-4 mr-2 text-emerald-500" />;
    case 'examen':
      return <FileText className="h-4 w-4 mr-2 text-orange-500" />;
    case 'reunion':
      return <Users className="h-4 w-4 mr-2 text-blue-500" />;
    case 'devoir':
      return <Book className="h-4 w-4 mr-2 text-violet-500" />;
    default:
      return null;
  }
}

export function getEventBadge(type: string) {
  switch(type) {
    case 'cours':
      return <Badge className="bg-emerald-500 hover:bg-emerald-600 font-medium text-xs">Cours</Badge>;
    case 'examen':
      return <Badge className="bg-orange-500 hover:bg-orange-600 font-medium text-xs">Examen</Badge>;
    case 'reunion':
      return <Badge className="bg-blue-500 hover:bg-blue-600 font-medium text-xs">Réunion</Badge>;
    case 'devoir':
      return <Badge className="bg-violet-500 hover:bg-violet-600 font-medium text-xs">Devoir</Badge>;
    default:
      return <Badge variant="outline" className="text-xs">{type}</Badge>;
  }
}

const EventCard = ({ 
  id, 
  title, 
  type, 
  className, 
  teacherName, 
  startTime, 
  endTime, 
  location, 
  color,
  onClick,
  compact = false 
}: EventCardProps) => {
  if (compact) {
    return (
      <div 
        className="p-1 text-xs rounded-md mb-1 cursor-pointer hover:opacity-80 transition-opacity"
        style={{ backgroundColor: color + '30', borderLeft: `3px solid ${color}` }}
        onClick={onClick}
      >
        <div className="font-medium truncate">{title}</div>
        {startTime && (
          <div className="flex items-center">
            <Clock className="h-3 w-3 mr-1" />
            {startTime}
          </div>
        )}
      </div>
    );
  }
  
  return (
    <Card 
      className="border border-gray-100 shadow-sm hover:shadow-md transition-shadow cursor-pointer overflow-hidden"
      style={{ borderLeft: `4px solid ${color}` }}
      onClick={onClick}
    >
      <CardContent className="p-3">
        <div className="flex flex-col sm:flex-row justify-between gap-2">
          <div>
            <div className="flex items-center mb-1">
              {getEventIcon(type)}
              <h3 className="font-medium">{title}</h3>
            </div>
            <p className="text-sm text-gray-500">{className}</p>
            <p className="text-sm text-gray-500">Prof: {teacherName}</p>
            {location && (
              <div className="flex items-center text-sm text-gray-500 mt-1">
                <MapPin className="h-3 w-3 mr-1" />
                {location}
              </div>
            )}
          </div>
          <div className="flex flex-col items-start sm:items-end gap-1">
            {startTime && (
              <div className="flex items-center gap-2 bg-gray-50 px-2 py-1 rounded-md">
                <Clock className="h-4 w-4 text-gray-500" />
                <span className="text-sm font-medium">
                  {startTime} - {endTime}
                </span>
              </div>
            )}
            <div>{getEventBadge(type)}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default EventCard;
