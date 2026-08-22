import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { User, Mail, Phone, Calendar, MapPin, FileText, MessageSquare, Lock } from 'lucide-react';
import SubscriptionGuard from '@/components/subscription/SubscriptionGuard';
import { StudentActions } from './StudentActions';

interface StudentCardProps {
  student: {
    id: string;
    name: string;
    email: string;
    phone?: string;
    dateOfBirth?: string;
    address?: string;
    status: 'active' | 'inactive' | 'suspended';
    attendanceRate?: number;
    class?: string;
  };
  onViewDetails: (studentId: string) => void;
  onContact: (studentId: string) => void;
  onEdit?: (studentId: string) => void;
  onDelete?: (studentId: string) => void;
  onSuspend?: (studentId: string) => void;
  onReactivate?: (studentId: string) => void;
  showActions?: boolean;
}

const StudentCard: React.FC<StudentCardProps> = ({ 
  student, 
  onViewDetails, 
  onContact, 
  onEdit, 
  onDelete, 
  onSuspend, 
  onReactivate,
  showActions = false 
}) => {
  const { t } = useTranslation('students');
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'inactive': return 'bg-gray-100 text-gray-800';
      case 'suspended': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <Card className="hover:shadow-lg transition-all duration-200 border-0 shadow-sm bg-white">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
              <User className="h-4 w-4 text-primary-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 text-sm">{student.name}</h3>
              <p className="text-xs text-gray-500 truncate max-w-[180px]">{student.email}</p>
            </div>
          </div>
          <Badge 
            variant={student.status === 'active' ? 'default' : 'secondary'}
            className={`text-xs ${student.status === 'active' ? 'bg-green-100 text-green-700 hover:bg-green-100' : ''}`}
          >
            {student.status === 'active' ? t('statusActive') : student.status}
          </Badge>
        </div>

        {student.phone && (
          <div className="flex items-center gap-2 text-xs text-gray-600 mb-3">
            <Phone className="h-3 w-3" />
            {student.phone}
          </div>
        )}

        {student.attendanceRate && (
          <div className="flex items-center gap-2 text-xs text-gray-600 mb-3">
            <span className="text-gray-500">{t('card.attendance')}</span>
            <span className={`font-medium ${student.attendanceRate >= 90 ? 'text-green-600' : student.attendanceRate >= 75 ? 'text-amber-600' : 'text-red-600'}`}>
              {student.attendanceRate}%
            </span>
          </div>
        )}

        {student.status === 'suspended' && (
          <div className="flex items-center gap-2 text-xs text-red-600 mb-3 bg-red-50 p-2 rounded">
            <Lock className="h-3 w-3" />
            <span>{t('card.suspended')}</span>
          </div>
        )}

        {showActions && onEdit && onDelete && onSuspend && onReactivate ? (
          <StudentActions
            student={student}
            onViewDetails={onViewDetails}
            onEdit={onEdit}
            onDelete={onDelete}
            onSuspend={onSuspend}
            onReactivate={onReactivate}
            onContact={onContact}
            compact
          />
        ) : (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => onViewDetails(student.id)}
              className="flex-1 h-8 text-xs"
            >
              <FileText className="h-3 w-3 mr-1" />
              {t('card.view')}
            </Button>
            
            <SubscriptionGuard feature="advanced_reports" compact>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onContact(student.id)}
                className="flex-1 h-8 text-xs"
              >
                <MessageSquare className="h-3 w-3 mr-1" />
                {t('card.contact')}
              </Button>
            </SubscriptionGuard>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default StudentCard;