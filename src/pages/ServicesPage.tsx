import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useStrkAuth } from '@/hooks/useStrkAuth';
import { useToast } from '@/hooks/use-toast';
import { apiClient, ApiError } from '@/lib/apiClient';
import { EmptyState } from '@/components/ui/EmptyState';
import { fetchStrkUsersByInstitution, type User } from '@/services/strkUserService';
import { Loader2, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { tCommon } from '@/i18n/config';

type InstitutionOption = { id: string; name: string };
type StudentOpt = { id: string; label: string };

type Enrollment = {
  id: string;
  studentId: string;
  studentName?: string;
  invoiceId?: string | null;
  invoice?: { id: string; invoiceNumber: string; totalCents: number; status: string } | null;
};
type TransportStop = { id: string; name: string; sequence: number; address?: string | null };
type ScheduleSlot = {
  id: string;
  dayOfWeek: number;
  departureTime: string;
  direction: string;
  label?: string | null;
  stopId?: string | null;
};
type RouteRow = {
  id: string;
  name: string;
  capacity: number | null;
  isActive: boolean;
  enrollments: Enrollment[];
  stops?: TransportStop[];
  scheduleSlots?: ScheduleSlot[];
};
type PlanRow = {
  id: string;
  name: string;
  priceCents: number;
  isActive: boolean;
  subscriptions: Enrollment[];
};
type Loan = { id: string; studentId: string; studentName?: string; dueAt: string };
type ItemRow = {
  id: string;
  title: string;
  available: number;
  quantity: number;
  loans: Loan[];
};
type RoomRow = {
  id: string;
  label: string;
  capacity: number;
  assignments: Enrollment[];
};
type VisitRow = { id: string; reason: string; visitAt: string; studentName?: string };
type StaffRow = {
  id: string;
  jobTitle: string;
  profile: { firstName?: string; lastName?: string; email?: string };
};

/**
 * Lot 9 — socle opérationnel sur `/services/*` + facturation cantine.
 */
const ServicesPage = () => {
  const { user } = useStrkAuth();
  const { toast } = useToast();
  const { t } = useTranslation('services');
  const { t: tc } = useTranslation('common');
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [visits, setVisits] = useState<VisitRow[]>([]);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [students, setStudents] = useState<StudentOpt[]>([]);
  const [staffUsers, setStaffUsers] = useState<User[]>([]);
  const [newName, setNewName] = useState('');
  const [newPriceCfa, setNewPriceCfa] = useState('15000');
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [clinicReason, setClinicReason] = useState('');
  const [hrProfileId, setHrProfileId] = useState('');
  const [hrJobTitle, setHrJobTitle] = useState('');
  const [stopName, setStopName] = useState('');
  const [slotDay, setSlotDay] = useState('1');
  const [slotTime, setSlotTime] = useState('07:30');
  const [slotDirection, setSlotDirection] = useState<'outbound' | 'inbound'>('outbound');
  const [institutions, setInstitutions] = useState<InstitutionOption[]>([]);
  const [institutionId, setInstitutionId] = useState<string | null>(user?.institutionId ?? null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('transport');
  const [featureDisabled, setFeatureDisabled] = useState(false);
  const [canteenDisabled, setCanteenDisabled] = useState(false);

  useEffect(() => {
    if (user?.institutionId) {
      setInstitutionId(user.institutionId);
      return;
    }
    if (user?.role !== 'admin') return;
    void (async () => {
      try {
        const { institutions: list } = await apiClient.get<{ institutions: InstitutionOption[] }>(
          '/institutions'
        );
        setInstitutions(list);
        if (list[0]) setInstitutionId(list[0].id);
      } catch {
        toast({
          title: tCommon('status.error'),
          description: t('loadInstitutionsError'),
          variant: 'destructive',
        });
      }
    })();
  }, [user?.institutionId, user?.role, toast]);

  const qs = institutionId ? `?institutionId=${encodeURIComponent(institutionId)}` : '';

  const load = useCallback(async () => {
    if (!institutionId) return;
    setLoading(true);
    setFeatureDisabled(false);
    setCanteenDisabled(false);
    try {
      const [r, i, b, v, h, studRes] = await Promise.all([
        apiClient.get<{ routes: RouteRow[] }>(`/services/transport/routes${qs}`),
        apiClient.get<{ items: ItemRow[] }>(`/services/library/items${qs}`),
        apiClient.get<{ rooms: RoomRow[] }>(`/services/boarding/rooms${qs}`),
        apiClient.get<{ visits: VisitRow[] }>(`/services/clinic/visits${qs}`),
        apiClient.get<{ records: StaffRow[] }>(`/services/hr/staff${qs}`),
        apiClient.get<{
          students: { id: string; institutionId: string; profile?: { firstName?: string; lastName?: string } }[];
        }>('/students'),
      ]);
      setRoutes(r.routes);
      setItems(i.items);
      setRooms(b.rooms);
      setVisits(v.visits);
      setStaff(h.records);
      setStudents(
        studRes.students
          .filter((s) => s.institutionId === institutionId)
          .map((s) => ({
            id: s.id,
            label: [s.profile?.firstName, s.profile?.lastName].filter(Boolean).join(' ') || s.id,
          }))
      );

      try {
        const p = await apiClient.get<{ plans: PlanRow[] }>(`/services/canteen/plans${qs}`);
        setPlans(p.plans);
      } catch (canteenErr) {
        if (
          canteenErr instanceof ApiError &&
          canteenErr.status === 403 &&
          canteenErr.code === 'feature_disabled'
        ) {
          setCanteenDisabled(true);
          setPlans([]);
        } else {
          throw canteenErr;
        }
      }

      try {
        const users = await fetchStrkUsersByInstitution(institutionId);
        setStaffUsers(users.filter((u) => u.role !== 'student' && u.role !== 'parent'));
      } catch {
        setStaffUsers([]);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 403 && err.code === 'feature_disabled') {
        setFeatureDisabled(true);
        setRoutes([]);
        setPlans([]);
        setItems([]);
        setRooms([]);
        setVisits([]);
        setStaff([]);
      } else {
        toast({
          title: tCommon('status.error'),
          description: err instanceof ApiError ? err.message : t('loadError'),
          variant: 'destructive',
        });
      }
    } finally {
      setLoading(false);
    }
  }, [institutionId, qs, toast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const studentOptions = useMemo(() => students, [students]);

  const requireInstitution = () => {
    if (!institutionId) {
      toast({
        title: t('institutionRequiredTitle'),
        description: t('institutionRequiredBody'),
        variant: 'destructive',
      });
      return false;
    }
    return true;
  };

  const run = async (label: string, action: () => Promise<void>) => {
    if (!requireInstitution()) return;
    setSaving(true);
    try {
      await action();
      toast({ title: label });
      await load();
    } catch (err) {
      toast({
        title: t('failure'),
        description: err instanceof ApiError ? err.message : label,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const requireName = (label: string) => {
    if (!newName.trim()) {
      toast({
        title: t('nameRequiredTitle'),
        description: t('nameRequiredBody', { label }),
        variant: 'destructive',
      });
      return false;
    }
    return requireInstitution();
  };

  const createRoute = () => {
    if (!requireName(t('route'))) return;
    void run(t('routeCreated'), () =>
      apiClient.post('/services/transport/routes', {
        name: newName.trim(),
        capacity: 40,
        institutionId,
      }).then(() => {
        setNewName('');
      })
    );
  };

  const createPlan = () => {
    if (!requireName(t('plan'))) return;
    const cfa = Number(newPriceCfa);
    const priceCents = Number.isFinite(cfa) && cfa >= 0 ? Math.round(cfa * 100) : 0;
    void run(t('planCreated'), () =>
      apiClient.post('/services/canteen/plans', {
        name: newName.trim(),
        priceCents,
        institutionId,
      }).then(() => {
        setNewName('');
      })
    );
  };

  const createItem = () => {
    if (!requireName(t('item'))) return;
    void run(t('itemCreated'), () =>
      apiClient.post('/services/library/items', {
        title: newName.trim(),
        quantity: 1,
        institutionId,
      }).then(() => {
        setNewName('');
      })
    );
  };

  const createRoom = () => {
    if (!requireName(t('room'))) return;
    void run(t('roomCreated'), () =>
      apiClient.post('/services/boarding/rooms', {
        label: newName.trim(),
        capacity: 2,
        institutionId,
      }).then(() => {
        setNewName('');
      })
    );
  };

  const needStudent = () => {
    if (!selectedStudentId) {
      toast({ title: t('studentRequiredTitle'), description: t('studentRequiredBody'), variant: 'destructive' });
      return false;
    }
    return true;
  };

  const placeholderByTab: Record<string, string> = {
    transport: t('placeholders.transport'),
    canteen: t('placeholders.canteen'),
    library: t('placeholders.library'),
    boarding: t('placeholders.boarding'),
    clinic: t('placeholders.clinic'),
    hr: t('placeholders.hr'),
  };

  const StudentPicker = () => (
    <div className="max-w-xs space-y-2">
      <Label>{t('student')}</Label>
      <Select value={selectedStudentId || undefined} onValueChange={setSelectedStudentId}>
        <SelectTrigger>
          <SelectValue placeholder={studentOptions.length ? t('chooseStudent') : t('noStudent')} />
        </SelectTrigger>
        <SelectContent>
          {studentOptions.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="space-y-6 py-6">
      <div>
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground">
          {t('subtitle')}
        </p>
        <p className="mt-2 max-w-3xl text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          {t('disclaimer')}
        </p>
      </div>

      {featureDisabled ? (
        <EmptyState title={t('featureDisabledTitle')} description={t('featureDisabledBody')} />
      ) : (
      <>
      {user?.role === 'admin' && !user.institutionId && (
        <div className="max-w-sm space-y-2">
          <Label htmlFor="services-institution">{t('institution')}</Label>
          <Select value={institutionId ?? undefined} onValueChange={(id) => setInstitutionId(id)}>
            <SelectTrigger id="services-institution">
              <SelectValue placeholder={t('chooseInstitution')} />
            </SelectTrigger>
            <SelectContent>
              {institutions.map((inst) => (
                <SelectItem key={inst.id} value={inst.id}>
                  {inst.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {!['clinic', 'hr'].includes(activeTab) && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="space-y-2">
            <Label htmlFor="services-name">{t('nameOrTitle')}</Label>
            <Input
              id="services-name"
              placeholder={placeholderByTab[activeTab] || t('nameOrTitle')}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="max-w-xs"
            />
          </div>
          {activeTab === 'canteen' && (
            <div className="space-y-2">
              <Label htmlFor="services-price">{t('priceCfa')}</Label>
              <Input
                id="services-price"
                type="number"
                min={0}
                step={100}
                value={newPriceCfa}
                onChange={(e) => setNewPriceCfa(e.target.value)}
                className="max-w-[8rem]"
              />
            </div>
          )}
          <StudentPicker />
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex h-auto flex-wrap">
          <TabsTrigger value="transport">{t('tabs.transport')}</TabsTrigger>
          <TabsTrigger value="canteen">{t('tabs.canteen')}</TabsTrigger>
          <TabsTrigger value="library">{t('tabs.library')}</TabsTrigger>
          <TabsTrigger value="boarding">{t('tabs.boarding')}</TabsTrigger>
          <TabsTrigger value="clinic">{t('tabs.clinic')}</TabsTrigger>
          <TabsTrigger value="hr">{t('tabs.hr')}</TabsTrigger>
        </TabsList>

        <TabsContent value="transport" className="space-y-3">
          <Button onClick={createRoute} disabled={saving || loading}>
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
                    {!r.isActive && <Badge variant="secondary">{t('inactive')}</Badge>}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 pb-4">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={saving || !r.isActive}
                    onClick={() => {
                      if (!needStudent()) return;
                      void run(t('studentEnrolled'), () =>
                        apiClient.post(`/services/transport/routes/${r.id}/enroll`, {
                          studentId: selectedStudentId,
                        })
                      );
                    }}
                  >
                    {t('enrollStudent')}
                  </Button>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    {r.enrollments.map((e) => (
                      <li key={e.id} className="flex items-center justify-between gap-2">
                        <span>{e.studentName ?? e.studentId}</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={saving}
                          onClick={() =>
                            void run(t('enrollmentClosed'), () =>
                              apiClient.post(`/services/transport/enrollments/${e.id}/end`, {})
                            )
                          }
                        >
                          {tc('actions.remove')}
                        </Button>
                      </li>
                    ))}
                  </ul>

                  <div className="space-y-2 border-t pt-3">
                    <p className="text-sm font-medium">{t('planning.stops')}</p>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      {(r.stops ?? []).map((s) => (
                        <li key={s.id} className="flex items-center justify-between gap-2">
                          <span>
                            {s.sequence}. {s.name}
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={saving}
                            onClick={() =>
                              void run(t('planning.stopRemoved'), () =>
                                apiClient.delete(`/services/transport/stops/${s.id}`)
                              )
                            }
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
                        onChange={(e) => setStopName(e.target.value)}
                      />
                      <Button
                        size="sm"
                        disabled={saving || !stopName.trim()}
                        onClick={() => {
                          const name = stopName.trim();
                          if (!name) return;
                          void run(t('planning.stopAdded'), async () => {
                            await apiClient.post(`/services/transport/routes/${r.id}/stops`, { name });
                            setStopName('');
                          });
                        }}
                      >
                        {t('planning.addStop')}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2 border-t pt-3">
                    <p className="text-sm font-medium">{t('planning.schedule')}</p>
                    <ul className="text-sm text-muted-foreground space-y-1">
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
                            onClick={() =>
                              void run(t('planning.slotRemoved'), () =>
                                apiClient.delete(`/services/transport/schedule/${slot.id}`)
                              )
                            }
                          >
                            {tc('actions.remove')}
                          </Button>
                        </li>
                      ))}
                    </ul>
                    <div className="flex flex-wrap items-end gap-2">
                      <div>
                        <Label className="text-xs">{t('planning.day')}</Label>
                        <Select value={slotDay} onValueChange={setSlotDay}>
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
                          onChange={(e) => setSlotTime(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">{t('planning.direction')}</Label>
                        <Select
                          value={slotDirection}
                          onValueChange={(v) => setSlotDirection(v as 'outbound' | 'inbound')}
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
                        onClick={() =>
                          void run(t('planning.slotAdded'), () =>
                            apiClient.post(`/services/transport/routes/${r.id}/schedule`, {
                              dayOfWeek: Number(slotDay),
                              departureTime: slotTime,
                              direction: slotDirection,
                            })
                          )
                        }
                      >
                        {t('planning.addSlot')}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="canteen" className="space-y-3">
          {canteenDisabled ? (
            <EmptyState title={t('canteenDisabledTitle')} description={t('canteenDisabledBody')} />
          ) : (
            <>
          <Button onClick={createPlan} disabled={saving || loading}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            {t('plan')}
          </Button>
          {plans.length === 0 ? (
            <EmptyState title={t('emptyPlansTitle')} description={t('emptyPlansBody')} />
          ) : (
            plans.map((p) => (
              <Card key={p.id}>
                <CardHeader className="py-3">
                  <CardTitle className="text-base">
                    {p.name} — {(p.priceCents / 100).toFixed(0)}{' '}
                    <Badge variant="outline">{t('abo', { count: p.subscriptions.length })}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 pb-4">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={saving || !p.isActive}
                    onClick={() => {
                      if (!needStudent()) return;
                      void run(t('subscriptionCreated'), async () => {
                        const res = await apiClient.post<{
                          subscription: Enrollment;
                          invoice?: { invoiceNumber: string; totalCents: number } | null;
                        }>(`/services/canteen/plans/${p.id}/subscribe`, {
                          studentId: selectedStudentId,
                        });
                        if (res.invoice) {
                          toast({
                            title: t('invoiceCreatedTitle'),
                            description: t('invoiceCreatedBody', {
                              number: res.invoice.invoiceNumber,
                              amount: (res.invoice.totalCents / 100).toFixed(0),
                            }),
                          });
                        }
                      });
                    }}
                  >
                    {t('subscribeStudent')}
                  </Button>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    {p.subscriptions.map((s) => (
                      <li key={s.id} className="flex items-center justify-between gap-2">
                        <span className="flex flex-wrap items-center gap-2">
                          {s.studentName ?? s.studentId}
                          {s.invoice?.invoiceNumber ? (
                            <Badge variant="secondary">
                              {t('invoiced', { number: s.invoice.invoiceNumber })}
                            </Badge>
                          ) : p.priceCents > 0 ? (
                            <Badge variant="outline">{t('notInvoiced')}</Badge>
                          ) : null}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={saving}
                          onClick={() =>
                            void run(t('subscriptionClosed'), () =>
                              apiClient.post(`/services/canteen/subscriptions/${s.id}/end`, {})
                            )
                          }
                        >
                          {t('close')}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))
          )}
            </>
          )}
        </TabsContent>

        <TabsContent value="library" className="space-y-3">
          <Button onClick={createItem} disabled={saving || loading}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            {t('item')}
          </Button>
          {items.length === 0 ? (
            <EmptyState title={t('emptyLibraryTitle')} description={t('emptyLibraryBody')} />
          ) : (
            items.map((i) => (
              <Card key={i.id}>
                <CardHeader className="py-3">
                  <CardTitle className="text-base">
                    {t('available', { title: i.title, available: i.available, quantity: i.quantity })}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 pb-4">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={saving || i.available < 1}
                    onClick={() => {
                      if (!needStudent()) return;
                      void run(t('loanCreated'), () =>
                        apiClient.post(`/services/library/items/${i.id}/loan`, {
                          studentId: selectedStudentId,
                        })
                      );
                    }}
                  >
                    {t('loanToStudent')}
                  </Button>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    {i.loans.map((l) => (
                      <li key={l.id} className="flex items-center justify-between gap-2">
                        <span>
                          {t('due', { name: l.studentName ?? l.studentId, date: new Date(l.dueAt).toLocaleDateString('fr-FR') })}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={saving}
                          onClick={() =>
                            void run(t('returned'), () =>
                              apiClient.post(`/services/library/loans/${l.id}/return`, {})
                            )
                          }
                        >
                          {t('return')}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="boarding" className="space-y-3">
          <Button onClick={createRoom} disabled={saving || loading}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            {t('room')}
          </Button>
          {rooms.length === 0 ? (
            <EmptyState title={t('emptyRoomsTitle')} description={t('emptyRoomsBody')} />
          ) : (
            rooms.map((r) => (
              <Card key={r.id}>
                <CardHeader className="py-3">
                  <CardTitle className="text-base">
                    {r.label} — {r.assignments.length}/{r.capacity}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 pb-4">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={saving || r.assignments.length >= r.capacity}
                    onClick={() => {
                      if (!needStudent()) return;
                      void run(t('assignmentCreated'), () =>
                        apiClient.post(`/services/boarding/rooms/${r.id}/assign`, {
                          studentId: selectedStudentId,
                        })
                      );
                    }}
                  >
                    {t('assignStudent')}
                  </Button>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    {r.assignments.map((a) => (
                      <li key={a.id} className="flex items-center justify-between gap-2">
                        <span>{a.studentName ?? a.studentId}</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={saving}
                          onClick={() =>
                            void run(t('assignmentClosed'), () =>
                              apiClient.post(`/services/boarding/assignments/${a.id}/end`, {})
                            )
                          }
                        >
                          {t('release')}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="clinic" className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <StudentPicker />
            <div className="space-y-2 flex-1 max-w-md">
              <Label htmlFor="clinic-reason">{t('reason')}</Label>
              <Input
                id="clinic-reason"
                value={clinicReason}
                onChange={(e) => setClinicReason(e.target.value)}
                placeholder={t('reasonPlaceholder')}
              />
            </div>
            <Button
              disabled={saving}
              onClick={() => {
                if (!needStudent()) return;
                if (!clinicReason.trim()) {
                  toast({ title: t('reasonRequired'), variant: 'destructive' });
                  return;
                }
                void run(t('visitCreated'), () =>
                  apiClient
                    .post('/services/clinic/visits', {
                      studentId: selectedStudentId,
                      reason: clinicReason.trim(),
                      institutionId,
                    })
                    .then(() => setClinicReason(''))
                );
              }}
            >
              {t('saveVisit')}
            </Button>
          </div>
          {visits.length === 0 ? (
            <EmptyState title={t('emptyVisitsTitle')} description={t('emptyVisitsBody')} />
          ) : (
            visits.map((v) => (
              <Card key={v.id}>
                <CardContent className="py-3 text-sm">
                  {t('visitRow', {
                    date: new Date(v.visitAt).toLocaleString('fr-FR'),
                    student: v.studentName ?? t('studentFallback'),
                    reason: v.reason,
                  })}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="hr" className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="max-w-xs space-y-2">
              <Label>{t('staff')}</Label>
              <Select value={hrProfileId || undefined} onValueChange={setHrProfileId}>
                <SelectTrigger>
                  <SelectValue placeholder={staffUsers.length ? t('chooseProfile') : t('noProfile')} />
                </SelectTrigger>
                <SelectContent>
                  {staffUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name} ({u.role})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="hr-title">{t('jobTitle')}</Label>
              <Input
                id="hr-title"
                value={hrJobTitle}
                onChange={(e) => setHrJobTitle(e.target.value)}
                placeholder={t('jobPlaceholder')}
                className="max-w-xs"
              />
            </div>
            <Button
              disabled={saving}
              onClick={() => {
                if (!hrProfileId || !hrJobTitle.trim()) {
                  toast({
                    title: t('fieldsRequiredTitle'),
                    description: t('fieldsRequiredBody'),
                    variant: 'destructive',
                  });
                  return;
                }
                void run(t('hrCreated'), () =>
                  apiClient
                    .post('/services/hr/staff', {
                      profileId: hrProfileId,
                      jobTitle: hrJobTitle.trim(),
                      institutionId,
                    })
                    .then(() => {
                      setHrJobTitle('');
                      setHrProfileId('');
                    })
                );
              }}
            >
              {t('createHr')}
            </Button>
          </div>
          {staff.length === 0 ? (
            <EmptyState title={t('emptyHrTitle')} description={t('emptyHrBody')} />
          ) : (
            staff.map((s) => (
              <Card key={s.id}>
                <CardContent className="py-3">
                  {s.jobTitle} — {[s.profile.firstName, s.profile.lastName].filter(Boolean).join(' ')}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
      </>
      )}
    </div>
  );
};

export default ServicesPage;
