import { Loader2, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export type ServicesTransportEnrollment = {
  id: string;
  studentId: string;
  studentName?: string;
};

export type ServicesTransportStop = {
  id: string;
  name: string;
  sequence: number;
};

export type ServicesTransportSlot = {
  id: string;
  dayOfWeek: number;
  departureTime: string;
  direction: string;
  label?: string | null;
};

export type ServicesTransportRoute = {
  id: string;
  name: string;
  capacity: number | null;
  isActive: boolean;
  enrollments: ServicesTransportEnrollment[];
  stops?: ServicesTransportStop[];
  scheduleSlots?: ServicesTransportSlot[];
};

type ServicesTransportPanelProps = {
  routes: ServicesTransportRoute[];
  saving: boolean;
  loading: boolean;
  stopName: string;
  onStopNameChange: (value: string) => void;
  slotDay: string;
  onSlotDayChange: (value: string) => void;
  slotTime: string;
  onSlotTimeChange: (value: string) => void;
  slotDirection: 'outbound' | 'inbound';
  onSlotDirectionChange: (value: 'outbound' | 'inbound') => void;
  onCreateRoute: () => void;
  onEnroll: (routeId: string) => void;
  onEndEnrollment: (enrollmentId: string) => void;
  onRemoveStop: (stopId: string) => void;
  onAddStop: (routeId: string) => void;
  onRemoveSlot: (slotId: string) => void;
  onAddSlot: (routeId: string) => void;
};

/** Module transport — extrait de ServicesPage. */
export function ServicesTransportPanel({
  routes,
  saving,
  loading,
  stopName,
  onStopNameChange,
  slotDay,
  onSlotDayChange,
  slotTime,
  onSlotTimeChange,
  slotDirection,
  onSlotDirectionChange,
  onCreateRoute,
  onEnroll,
  onEndEnrollment,
  onRemoveStop,
  onAddStop,
  onRemoveSlot,
  onAddSlot,
}: ServicesTransportPanelProps) {
  const { t } = useTranslation('services');
  const { t: tc } = useTranslation('common');

  return (
    <div className="space-y-3">
      <Button onClick={onCreateRoute} disabled={saving || loading}>
        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
        {t('route')}
      </Button>
      {routes.length === 0 ? (
        <EmptyState title={t('emptyRoutesTitle')} description={t('emptyRoutesBody')} />
      ) : (
        routes.map((r) => (
          <Card key={r.id}>
            <CardHeader className="py-3">
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                {r.name}
                <Badge variant="outline">
                  {t('enrolled', {
                    enrolled: r.enrollments.length,
                    cap: r.capacity != null ? `/${r.capacity}` : '',
                  })}
                </Badge>
                {!r.isActive ? <Badge variant="secondary">{t('inactive')}</Badge> : null}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pb-4">
              <Button
                size="sm"
                variant="secondary"
                disabled={saving || !r.isActive}
                onClick={() => onEnroll(r.id)}
              >
                {t('enrollStudent')}
              </Button>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {r.enrollments.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-2">
                    <span>{e.studentName ?? e.studentId}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={saving}
                      onClick={() => onEndEnrollment(e.id)}
                    >
                      {tc('actions.remove')}
                    </Button>
                  </li>
                ))}
              </ul>

              <div className="space-y-2 border-t pt-3">
                <p className="text-sm font-medium">{t('planning.stops')}</p>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {(r.stops ?? []).map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-2">
                      <span>
                        {s.sequence}. {s.name}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={saving}
                        onClick={() => onRemoveStop(s.id)}
                      >
                        {tc('actions.remove')}
                      </Button>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap gap-2">
                  <Input
                    className="max-w-xs"
                    placeholder={t('planning.stopPlaceholder')}
                    value={stopName}
                    onChange={(e) => onStopNameChange(e.target.value)}
                  />
                  <Button
                    size="sm"
                    disabled={saving || !stopName.trim()}
                    onClick={() => onAddStop(r.id)}
                  >
                    {t('planning.addStop')}
                  </Button>
                </div>
              </div>

              <div className="space-y-2 border-t pt-3">
                <p className="text-sm font-medium">{t('planning.schedule')}</p>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {(r.scheduleSlots ?? []).map((slot) => (
                    <li key={slot.id} className="flex items-center justify-between gap-2">
                      <span>
                        {t(`planning.day${slot.dayOfWeek}`)} · {slot.departureTime} ·{' '}
                        {slot.direction === 'inbound' ? t('planning.inbound') : t('planning.outbound')}
                        {slot.label ? ` — ${slot.label}` : ''}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={saving}
                        onClick={() => onRemoveSlot(slot.id)}
                      >
                        {tc('actions.remove')}
                      </Button>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap items-end gap-2">
                  <div>
                    <Label className="text-xs">{t('planning.day')}</Label>
                    <Select value={slotDay} onValueChange={onSlotDayChange}>
                      <SelectTrigger className="w-[140px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                          <SelectItem key={d} value={String(d)}>
                            {t(`planning.day${d}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">{t('planning.time')}</Label>
                    <Input
                      className="w-[110px]"
                      type="time"
                      value={slotTime}
                      onChange={(e) => onSlotTimeChange(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">{t('planning.direction')}</Label>
                    <Select
                      value={slotDirection}
                      onValueChange={(v) => onSlotDirectionChange(v as 'outbound' | 'inbound')}
                    >
                      <SelectTrigger className="w-[130px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="outbound">{t('planning.outbound')}</SelectItem>
                        <SelectItem value="inbound">{t('planning.inbound')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    size="sm"
                    disabled={saving || !slotTime}
                    onClick={() => onAddSlot(r.id)}
                  >
                    {t('planning.addSlot')}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
