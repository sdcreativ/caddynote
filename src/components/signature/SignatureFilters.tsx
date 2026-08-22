
import { useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

interface SignatureFiltersProps {
  onFilterChange: (filters: SignatureFilters) => void;
}

export interface SignatureFilters {
  search: string;
  status: 'all' | 'pending' | 'completed' | 'expired';
  date: Date | null;
}

export const SignatureFilters = ({ onFilterChange }: SignatureFiltersProps) => {
  const { t } = useTranslation('signatures');
  const [filters, setFilters] = useState<SignatureFilters>({
    search: '',
    status: 'all',
    date: null,
  });

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFilters = {
      ...filters,
      search: e.target.value,
    };
    setFilters(newFilters);
    onFilterChange(newFilters);
  };

  const handleStatusChange = (value: string) => {
    // Fix: Cast the value to the specific union type
    const status = value as 'all' | 'pending' | 'completed' | 'expired';
    const newFilters = {
      ...filters,
      status,
    };
    setFilters(newFilters);
    onFilterChange(newFilters);
  };

  const handleDateChange = (date: Date | null) => {
    const newFilters = {
      ...filters,
      date,
    };
    setFilters(newFilters);
    onFilterChange(newFilters);
  };

  const clearFilters = () => {
    const newFilters: SignatureFilters = {
      search: '',
      status: 'all',
      date: null,
    };
    setFilters(newFilters);
    onFilterChange(newFilters);
  };

  return (
    <div className="flex flex-col md:flex-row gap-3 mb-6">
      <div className="relative flex-grow">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
        <Input
          placeholder={t('filters.searchPlaceholder')}
          className="pl-8"
          value={filters.search}
          onChange={handleSearchChange}
        />
      </div>
      
      <Select 
        value={filters.status} 
        onValueChange={handleStatusChange}
      >
        <SelectTrigger className="w-full md:w-[180px]">
          <SelectValue placeholder={t('filters.statusPlaceholder')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('filters.allStatuses')}</SelectItem>
          <SelectItem value="pending">{t('filters.pending')}</SelectItem>
          <SelectItem value="completed">{t('filters.completed')}</SelectItem>
          <SelectItem value="expired">{t('filters.expired')}</SelectItem>
        </SelectContent>
      </Select>

      <Popover>
        <PopoverTrigger asChild>
          <Button 
            variant="outline" 
            className={cn(
              "w-full md:w-[200px] justify-start text-left font-normal",
              !filters.date && "text-gray-500"
            )}
          >
            {filters.date ? format(filters.date, 'dd/MM/yyyy') : t('filters.selectDate')}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={filters.date || undefined}
            onSelect={(date) => handleDateChange(date ?? null)}
            initialFocus
            className="p-3 pointer-events-auto"
          />
        </PopoverContent>
      </Popover>

      {(filters.search || filters.status !== 'all' || filters.date) && (
        <Button 
          variant="ghost" 
          onClick={clearFilters}
          className="w-full md:w-auto"
        >
          {t('filters.clear')}
        </Button>
      )}
    </div>
  );
};
