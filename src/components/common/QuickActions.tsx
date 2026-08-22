import React, { memo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LucideIcon } from 'lucide-react';

interface QuickAction {
  id: string;
  title: string;
  description?: string;
  icon: LucideIcon;
  onClick: () => void;
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  badge?: string;
  disabled?: boolean;
}

interface QuickActionsProps {
  title?: string;
  description?: string;
  actions: QuickAction[];
  columns?: 2 | 3 | 4;
  className?: string;
}

const QuickActions: React.FC<QuickActionsProps> = memo(({
  title = "Actions Rapides",
  description,
  actions,
  columns = 3,
  className,
}) => {
  const gridCols = {
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4',
  };

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <div className={`grid ${gridCols[columns]} gap-4`}>
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <Button
                key={action.id}
                variant={action.variant || 'outline'}
                onClick={action.onClick}
                disabled={action.disabled}
                className="h-auto p-4 flex flex-col gap-3 relative"
              >
                {action.badge && (
                  <Badge
                    variant="secondary"
                    className="absolute -top-2 -right-2 px-2 py-1"
                  >
                    {action.badge}
                  </Badge>
                )}
                <Icon className="h-6 w-6" />
                <div className="text-center">
                  <div className="font-medium">{action.title}</div>
                  {action.description && (
                    <div className="text-xs text-muted-foreground mt-1">
                      {action.description}
                    </div>
                  )}
                </div>
              </Button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
});

QuickActions.displayName = 'QuickActions';

export default QuickActions;