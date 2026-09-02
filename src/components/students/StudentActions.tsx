import React from 'react';
import { Button } from '@/components/ui/button';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';
import { 
  MoreHorizontal, 
  Eye, 
  Edit2, 
  Trash2, 
  Lock, 
  Unlock, 
  MessageSquare,
} from 'lucide-react';
import SubscriptionGuard from '@/components/subscription/SubscriptionGuard';

interface StudentActionsProps {
  student: {
    id: string;
    name: string;
    status: 'active' | 'inactive' | 'suspended';
  };
  onViewDetails: (studentId: string) => void;
  onEdit: (studentId: string) => void;
  onDelete: (studentId: string) => void;
  onSuspend: (studentId: string) => void;
  onReactivate: (studentId: string) => void;
  onContact: (studentId: string) => void;
  compact?: boolean;
}

export const StudentActions: React.FC<StudentActionsProps> = ({
  student,
  onViewDetails,
  onEdit,
  onDelete,
  onSuspend,
  onReactivate,
  onContact,
  compact = false
}) => {
  if (compact) {
    return (
      <div className="flex space-x-1">
        <Button
          size="sm"
          variant="outline"
          onClick={() => onViewDetails(student.id)}
          className="h-7 px-2"
        >
          <Eye className="h-3 w-3" />
        </Button>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 px-2">
              <MoreHorizontal className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => onEdit(student.id)}>
              <Edit2 className="mr-2 h-4 w-4" />
              Modifier
            </DropdownMenuItem>
            
            <SubscriptionGuard feature="advanced_reports" fallback={
              <DropdownMenuItem disabled>
                <MessageSquare className="mr-2 h-4 w-4" />
                Contacter (Premium)
              </DropdownMenuItem>
            }>
              <DropdownMenuItem onClick={() => onContact(student.id)}>
                <MessageSquare className="mr-2 h-4 w-4" />
                Contacter
              </DropdownMenuItem>
            </SubscriptionGuard>
            
            <DropdownMenuSeparator />
            
            {student.status === 'active' ? (
              <DropdownMenuItem 
                onClick={() => onSuspend(student.id)}
                className="text-amber-600"
              >
                <Lock className="mr-2 h-4 w-4" />
                Suspendre
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem 
                onClick={() => onReactivate(student.id)}
                className="text-green-600"
              >
                <Unlock className="mr-2 h-4 w-4" />
                Réactiver
              </DropdownMenuItem>
            )}
            
            <DropdownMenuSeparator />
            
            <DropdownMenuItem 
              onClick={() => onDelete(student.id)}
              className="text-red-600"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Supprimer
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  return (
    <div className="flex space-x-2">
      <Button
        size="sm"
        variant="outline"
        onClick={() => onViewDetails(student.id)}
      >
        <Eye className="mr-1 h-3 w-3" />
        Voir
      </Button>
      
      <Button
        size="sm"
        variant="outline"
        onClick={() => onEdit(student.id)}
      >
        <Edit2 className="mr-1 h-3 w-3" />
        Modifier
      </Button>
      
      <SubscriptionGuard feature="advanced_reports" compact>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onContact(student.id)}
        >
          <MessageSquare className="mr-1 h-3 w-3" />
          Contact
        </Button>
      </SubscriptionGuard>
      
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <MoreHorizontal className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {student.status === 'active' ? (
            <DropdownMenuItem 
              onClick={() => onSuspend(student.id)}
              className="text-amber-600"
            >
              <Lock className="mr-2 h-4 w-4" />
              Suspendre
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem 
              onClick={() => onReactivate(student.id)}
              className="text-green-600"
            >
              <Unlock className="mr-2 h-4 w-4" />
              Réactiver
            </DropdownMenuItem>
          )}
          
          <DropdownMenuSeparator />
          
          <DropdownMenuItem 
            onClick={() => onDelete(student.id)}
            className="text-red-600"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Supprimer
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
