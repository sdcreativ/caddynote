import { Loader2, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export type ServicesLibraryLoan = {
  id: string;
  studentId: string;
  studentName?: string;
  dueAt: string;
};

export type ServicesLibraryItem = {
  id: string;
  title: string;
  available: number;
  quantity: number;
  loans: ServicesLibraryLoan[];
};

type LoanFilter = 'all' | 'overdue' | 'active';

type ServicesLibraryPanelProps = {
  items: ServicesLibraryItem[];
  saving: boolean;
  loading: boolean;
  onCreateItem: () => void;
  onLoan: (itemId: string) => void;
  onReturn: (loanId: string) => void;
};

const isOverdue = (dueAt: string, now = Date.now()) => {
  const due = new Date(dueAt).getTime();
  return Number.isFinite(due) && due < now;
};

/** Module bibliothèque — catalogue, prêts, retours et filtre retards. */
export function ServicesLibraryPanel({
  items,
  saving,
  loading,
  onCreateItem,
  onLoan,
  onReturn,
}: ServicesLibraryPanelProps) {
  const { t } = useTranslation('services');
  const [loanFilter, setLoanFilter] = useState<LoanFilter>('all');
  const now = Date.now();

  const overdueCount = useMemo(
    () => items.reduce((n, item) => n + item.loans.filter((l) => isOverdue(l.dueAt, now)).length, 0),
    [items, now]
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={onCreateItem} disabled={saving || loading}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
          {t('item')}
        </Button>
        {overdueCount > 0 ? (
          <Badge variant="destructive">{t('overdueCount', { count: overdueCount })}</Badge>
        ) : null}
        <div className="flex items-center gap-2">
          <Label htmlFor="library-loan-filter" className="text-sm text-muted-foreground whitespace-nowrap">
            {t('loanFilterLabel')}
          </Label>
          <Select value={loanFilter} onValueChange={(v) => setLoanFilter(v as LoanFilter)}>
            <SelectTrigger id="library-loan-filter" className="w-[11rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('loanFilterAll')}</SelectItem>
              <SelectItem value="overdue">{t('loanFilterOverdue')}</SelectItem>
              <SelectItem value="active">{t('loanFilterActive')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState title={t('emptyLibraryTitle')} description={t('emptyLibraryBody')} />
      ) : (
        items.map((i) => {
          const visibleLoans = i.loans.filter((l) => {
            if (loanFilter === 'overdue') return isOverdue(l.dueAt, now);
            if (loanFilter === 'active') return !isOverdue(l.dueAt, now);
            return true;
          });
          const itemOverdue = i.loans.some((l) => isOverdue(l.dueAt, now));
          if (loanFilter === 'overdue' && visibleLoans.length === 0) return null;

          return (
            <Card key={i.id}>
              <CardHeader className="py-3">
                <CardTitle className="text-base flex flex-wrap items-center gap-2">
                  <span>
                    {t('available', { title: i.title, available: i.available, quantity: i.quantity })}
                  </span>
                  {itemOverdue ? <Badge variant="destructive">{t('overdueBadge')}</Badge> : null}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pb-4">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={saving || i.available < 1}
                  onClick={() => onLoan(i.id)}
                >
                  {t('loanToStudent')}
                </Button>
                <ul className="text-sm text-muted-foreground space-y-1">
                  {visibleLoans.map((l) => {
                    const late = isOverdue(l.dueAt, now);
                    return (
                      <li key={l.id} className="flex items-center justify-between gap-2">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className={late ? 'text-destructive font-medium' : undefined}>
                            {t('due', {
                              name: l.studentName ?? l.studentId,
                              date: new Date(l.dueAt).toLocaleDateString('fr-FR'),
                            })}
                          </span>
                          {late ? <Badge variant="destructive">{t('overdueBadge')}</Badge> : null}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={saving}
                          onClick={() => onReturn(l.id)}
                        >
                          {t('return')}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
