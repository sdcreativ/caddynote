import React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  status: 'success' | 'warning' | 'error' | 'info' | 'pending';
  children: React.ReactNode;
  className?: string;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status, children, className }) => {
  const statusStyles = {
    success: 'bg-success/10 text-success border-success/20 hover:bg-success/20',
    warning: 'bg-warning/10 text-warning border-warning/20 hover:bg-warning/20',
    error: 'bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/20',
    info: 'bg-info/10 text-info border-info/20 hover:bg-info/20',
    pending: 'bg-muted/10 text-muted-foreground border-muted/20 hover:bg-muted/20',
  };

  return (
    <Badge 
      variant="outline"
      className={cn(statusStyles[status], className)}
    >
      {children}
    </Badge>
  );
};

export default StatusBadge;