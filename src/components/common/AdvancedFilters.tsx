import React, { memo, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Filter, X } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export interface FilterOption {
  key: string;
  label: string;
  type: 'text' | 'select' | 'date' | 'dateRange';
  options?: { value: string; label: string }[];
  placeholder?: string;
}

export interface FilterValue {
  key: string;
  value: any;
  label: string;
}

interface AdvancedFiltersProps {
  title?: string;
  filters: FilterOption[];
  values: FilterValue[];
  onChange: (values: FilterValue[]) => void;
  onReset: () => void;
  className?: string;
}

const AdvancedFilters: React.FC<AdvancedFiltersProps> = memo(({
  title = "Filtres Avancés",
  filters,
  values,
  onChange,
  onReset,
  className,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleFilterChange = useCallback((key: string, value: any, label: string) => {
    const newValues = values.filter(v => v.key !== key);
    if (value !== null && value !== undefined && value !== '') {
      newValues.push({ key, value, label });
    }
    onChange(newValues);
  }, [values, onChange]);

  const removeFilter = useCallback((key: string) => {
    onChange(values.filter(v => v.key !== key));
  }, [values, onChange]);

  const renderFilterInput = (filter: FilterOption) => {
    const currentValue = values.find(v => v.key === filter.key)?.value;

    switch (filter.type) {
      case 'text':
        return (
          <Input
            value={currentValue || ''}
            onChange={(e) => handleFilterChange(filter.key, e.target.value, `${filter.label}: ${e.target.value}`)}
            placeholder={filter.placeholder}
          />
        );

      case 'select':
        return (
          <Select
            value={currentValue || ''}
            onValueChange={(value) => {
              const option = filter.options?.find(o => o.value === value);
              handleFilterChange(filter.key, value, `${filter.label}: ${option?.label || value}`);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder={filter.placeholder || `Sélectionner ${filter.label.toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent>
              {filter.options?.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case 'date':
        return (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-start">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {currentValue ? format(new Date(currentValue), 'dd/MM/yyyy', { locale: fr }) : filter.placeholder}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar
                mode="single"
                selected={currentValue ? new Date(currentValue) : undefined}
                onSelect={(date) => {
                  if (date) {
                    const formattedDate = format(date, 'dd/MM/yyyy', { locale: fr });
                    handleFilterChange(filter.key, date.toISOString(), `${filter.label}: ${formattedDate}`);
                  }
                }}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        );

      default:
        return null;
    }
  };

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-4 w-4" />
            {title}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? 'Masquer' : 'Afficher'}
          </Button>
        </div>
        {values.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {values.map((filter) => (
              <Badge
                key={filter.key}
                variant="secondary"
                className="flex items-center gap-1"
              >
                {filter.label}
                <X
                  className="h-3 w-3 cursor-pointer"
                  onClick={() => removeFilter(filter.key)}
                />
              </Badge>
            ))}
            <Button
              variant="ghost"
              size="sm"
              onClick={onReset}
              className="h-6 px-2 text-xs"
            >
              Tout effacer
            </Button>
          </div>
        )}
      </CardHeader>
      {isExpanded && (
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filters.map((filter) => (
              <div key={filter.key} className="space-y-2">
                <Label htmlFor={filter.key}>{filter.label}</Label>
                {renderFilterInput(filter)}
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
});

AdvancedFilters.displayName = 'AdvancedFilters';

export default AdvancedFilters;