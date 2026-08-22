import { useCallback, useEffect, useState } from 'react';
import { CreditCard, Plus, RefreshCw, Sprout } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { apiClient, ApiError } from '@/lib/apiClient';

type PlanRow = {
  id: string;
  name: string;
  priceMonthly: number | string;
  priceYearly?: number | string | null;
  stripePriceId?: string | null;
  stripeYearlyPriceId?: string | null;
  maxUsers?: number | null;
  maxStudents?: number | null;
  isActive: boolean;
  isTrial?: boolean | null;
  sortOrder?: number | null;
};

const emptyForm = {
  name: '',
  priceMonthly: '0',
  priceYearly: '',
  stripePriceId: '',
  stripeYearlyPriceId: '',
  maxUsers: '',
  maxStudents: '',
  isActive: true,
  isTrial: false,
  sortOrder: '0',
};

/** CRUD plans Stripe (Price IDs, quotas) — ops Super Admin / SubscriptionManager.
 * Distinct de `subscription/PublicOffersCatalogAdmin` (catalogue marketing public). */
const SubscriptionPlansAdmin = () => {
  const { toast } = useToast();
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { plans: rows } = await apiClient.get<{ plans: PlanRow[] }>('/subscriptions/plans/manage');
      setPlans(rows || []);
    } catch (e) {
      toast({
        title: 'Plans indisponibles',
        description: e instanceof ApiError ? e.message : 'Erreur',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const startEdit = (p: PlanRow) => {
    setEditId(p.id);
    setForm({
      name: p.name,
      priceMonthly: String(Number(p.priceMonthly)),
      priceYearly: p.priceYearly != null ? String(Number(p.priceYearly)) : '',
      stripePriceId: p.stripePriceId || '',
      stripeYearlyPriceId: p.stripeYearlyPriceId || '',
      maxUsers: p.maxUsers != null ? String(p.maxUsers) : '',
      maxStudents: p.maxStudents != null ? String(p.maxStudents) : '',
      isActive: !!p.isActive,
      isTrial: !!p.isTrial,
      sortOrder: String(p.sortOrder ?? 0),
    });
  };

  const resetForm = () => {
    setEditId(null);
    setForm(emptyForm);
  };

  const payload = () => ({
    name: form.name.trim(),
    priceMonthly: Number(form.priceMonthly) || 0,
    priceYearly: form.priceYearly.trim() === '' ? null : Number(form.priceYearly),
    stripePriceId: form.stripePriceId.trim() === '' ? null : form.stripePriceId.trim(),
    stripeYearlyPriceId: form.stripeYearlyPriceId.trim() === '' ? null : form.stripeYearlyPriceId.trim(),
    maxUsers: form.maxUsers.trim() === '' ? null : Number(form.maxUsers),
    maxStudents: form.maxStudents.trim() === '' ? null : Number(form.maxStudents),
    isActive: form.isActive,
    isTrial: form.isTrial,
    sortOrder: Number(form.sortOrder) || 0,
  });

  const onSave = async () => {
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      if (editId) {
        await apiClient.patch(`/subscriptions/plans/${editId}`, payload());
        toast({ title: 'Plan mis à jour' });
      } else {
        await apiClient.post('/subscriptions/plans', payload());
        toast({ title: 'Plan créé' });
      }
      resetForm();
      await load();
    } catch (e) {
      toast({
        title: 'Échec',
        description: e instanceof ApiError ? e.message : 'Erreur',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const onSeed = async () => {
    setBusy(true);
    try {
      const res = await apiClient.post<{ seeded: boolean }>('/subscriptions/plans/seed-public', {});
      toast({
        title: res.seeded ? 'Catalogue initialisé' : 'Catalogue déjà présent',
      });
      await load();
    } catch (e) {
      toast({
        title: 'Seed impossible',
        description: e instanceof ApiError ? e.message : 'Erreur',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="h-4 w-4" /> Catalogue des plans
          </CardTitle>
          <CardDescription>
            CRUD admin — Price IDs Stripe requis pour le checkout. Sans ID = plan DB only.
          </CardDescription>
        </div>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`mr-1 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Actualiser
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => void onSeed()} disabled={busy}>
            <Sprout className="mr-1 h-3.5 w-3.5" />
            Seed public
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="max-h-56 divide-y overflow-y-auto text-sm">
          {plans.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div>
                <p className="font-medium">
                  {p.name}{' '}
                  {!p.isActive && <Badge variant="secondary">inactif</Badge>}
                  {p.isTrial && <Badge variant="outline">essai</Badge>}
                </p>
                <p className="text-xs text-muted-foreground">
                  {Number(p.priceMonthly)} €/mois
                  {p.maxUsers != null ? ` · max ${p.maxUsers} users` : ''}
                  {p.stripePriceId ? ' · Stripe OK' : ' · DB only (pas de price ID)'}
                </p>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={() => startEdit(p)}>
                Modifier
              </Button>
            </li>
          ))}
          {plans.length === 0 && !loading && (
            <li className="py-4 text-muted-foreground">Aucun plan — utilisez Seed ou créez-en un.</li>
          )}
        </ul>

        <div className="rounded-lg border p-3 space-y-3">
          <p className="text-sm font-medium">{editId ? 'Modifier le plan' : 'Nouveau plan'}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Nom</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Prix mensuel (€)</Label>
              <Input
                type="number"
                value={form.priceMonthly}
                onChange={(e) => setForm((f) => ({ ...f, priceMonthly: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Prix annuel (€)</Label>
              <Input
                type="number"
                value={form.priceYearly}
                onChange={(e) => setForm((f) => ({ ...f, priceYearly: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Ordre</Label>
              <Input
                type="number"
                value={form.sortOrder}
                onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Max users</Label>
              <Input
                type="number"
                value={form.maxUsers}
                onChange={(e) => setForm((f) => ({ ...f, maxUsers: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Max élèves</Label>
              <Input
                type="number"
                value={form.maxStudents}
                onChange={(e) => setForm((f) => ({ ...f, maxStudents: e.target.value }))}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>stripePriceId (mensuel)</Label>
              <Input
                value={form.stripePriceId}
                placeholder="price_…"
                onChange={(e) => setForm((f) => ({ ...f, stripePriceId: e.target.value }))}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>stripeYearlyPriceId (annuel)</Label>
              <Input
                value={form.stripeYearlyPriceId}
                placeholder="price_…"
                onChange={(e) => setForm((f) => ({ ...f, stripeYearlyPriceId: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={form.isActive} onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))} />
              Actif
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={form.isTrial} onCheckedChange={(v) => setForm((f) => ({ ...f, isTrial: v }))} />
              Essai
            </label>
          </div>
          <div className="flex gap-2">
            <Button type="button" onClick={() => void onSave()} disabled={busy || !form.name.trim()}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              {editId ? 'Enregistrer' : 'Créer'}
            </Button>
            {editId && (
              <Button type="button" variant="ghost" onClick={resetForm}>
                Annuler
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default SubscriptionPlansAdmin;
