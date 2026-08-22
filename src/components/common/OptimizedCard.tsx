import React, { memo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface OptimizedCardProps {
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'elevated' | 'outline';
  interactive?: boolean;
}

const OptimizedCard: React.FC<OptimizedCardProps> = memo(({ 
  title,
  description,
  children,
  className,
  variant = 'default',
  interactive = false
}) => {
  const variantClasses = {
    default: '',
    elevated: 'shadow-lg shadow-glow',
    outline: 'border-2',
  };

  return (
    <Card 
      className={cn(
        'transition-all duration-200',
        variantClasses[variant],
        interactive && 'hover:shadow-md hover:scale-[1.02] cursor-pointer',
        className
      )}
    >
      {(title || description) && (
        <CardHeader>
          {title && <CardTitle>{title}</CardTitle>}
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
      )}
      <CardContent>
        {children}
      </CardContent>
    </Card>
  );
});

OptimizedCard.displayName = 'OptimizedCard';

export default OptimizedCard;