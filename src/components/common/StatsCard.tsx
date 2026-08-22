import React, { memo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatsCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon?: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
    label?: string;
  };
  variant?: 'default' | 'success' | 'warning' | 'info';
  className?: string;
}

const StatsCard: React.FC<StatsCardProps> = memo(({
  title,
  value,
  description,
  icon: Icon,
  trend,
  variant = 'default',
  className,
}) => {
  const variantStyles = {
    default: 'border-border',
    success: 'border-success/20 bg-success/5',
    warning: 'border-warning/20 bg-warning/5',
    info: 'border-info/20 bg-info/5',
  };

  return (
    <Card className={cn('transition-all duration-200 hover:shadow-md', variantStyles[variant], className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {(description || trend) && (
          <div className="flex items-center gap-2 mt-1">
            {trend && (
              <div className={cn(
                'flex items-center text-xs',
                trend.isPositive ? 'text-success' : 'text-destructive'
              )}>
                {trend.isPositive ? (
                  <TrendingUp className="h-3 w-3 mr-1" />
                ) : (
                  <TrendingDown className="h-3 w-3 mr-1" />
                )}
                {trend.value > 0 ? '+' : ''}{trend.value}%
                {trend.label && <span className="ml-1">{trend.label}</span>}
              </div>
            )}
            {description && (
              <p className="text-xs text-muted-foreground">
                {description}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
});

StatsCard.displayName = 'StatsCard';

export default StatsCard;