import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { apiClient, ApiError } from '@/lib/apiClient';
import { CreditCard, Plus, RefreshCw, Sparkles } from 'lucide-react';
import { LoadingState } from '@/components/ui/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState';

type PlanFeatures = {
  description?: string;
  featureList?: string[];
  ctaPath?: string;
  featured?: boolean;
  slug?: string;
  priceLabel?: string;
};

type ApiPlan = {
  id: string;
  name: string;
  priceMonthly: number | string;
  isActive: boolean | null;
  sortOrder: number | null;
  features: PlanFeatures | string;
};

const parseFeatures = (raw: PlanFeatures | string): PlanFeatures => {
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as PlanFeatures;
    } catch {
      return {};
    }
  }
  return raw || {};
};

/**
 * Catalogue des offres affichées sur l'accueil public — réservé au super admin.
 * Ce n'est pas une page de souscription personnelle.
 * Distinct de `admin/SubscriptionPlansAdmin` (CRUD Stripe Price IDs / ops billing).
 */
export function PublicOffersCatalogAdmin() {
  const { t: tc } = useTranslation('common');
  const { toast } = useToast();
  const [plans, setPlans] = useState<ApiPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    description: '',
    featureList: '',
    priceLabel: 'Sur devis',
    ctaPath: '/contact',
    featured: false,
    isActive: true,
    sortOrder: '0',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { plans: data } = await apiClient.get<{ plans: ApiPlan[] }>('/subscriptions/plans/manage');
      setPlans(data);
    } catch (e) {
      toast({
        title: tc('status.error'),
        description: e instanceof ApiError ? e.message : 'Impossible de charger les plans',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast, tc]);

  useEffect(() => {
    void load();
  }, [load]);

  const seedPublic = async () => {
    setSaving(true);
    try {
      const { seeded, synced, plans: data } = await apiClient.post<{
        seeded: boolean;
        synced?: number;
        plans: ApiPlan[];
      }>('/subscriptions/plans/seed-public', {});
      setPlans(data);
      toast({
        title: seeded ? 'Plans initialisés' : 'Catalogue resynchronisé',
        description: seeded
          ? 'Les offres Essentiel, Performance et Réseau ont été créées (marketing + entitlements).'
          : `${synced ?? 3} offre(s) publique(s) mises à jour (entitlements, quotas soft, textes).`,
      });
    } catch (e) {
      toast({
        title: tc('status.error'),
        description: e instanceof ApiError ? e.message : 'Échec de l’initialisation',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const createPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await apiClient.post('/subscriptions/plans', {
        name: form.name.trim(),
        priceMonthly: 0,
        isActive: form.isActive,
        sortOrder: parseInt(form.sortOrder, 10) || 0,
        features: {
          description: form.description.trim(),
          featureList: form.featureList
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean),
          ctaPath: form.ctaPath.trim() || '/contact',
          featured: form.featured,
          priceLabel: form.priceLabel.trim() || 'Sur devis',
          slug: form.name.trim().toLowerCase().replace(/\s+/g, '-'),
        },
      });
      setForm({
        name: '',
        description: '',
        featureList: '',
        priceLabel: 'Sur devis',
        ctaPath: '/contact',
        featured: false,
        isActive: true,
        sortOrder: String((plans.length + 1) * 10),
      });
      toast({ title: 'Plan créé', description: 'Visible sur l’accueil s’il est actif.' });
      await load();
    } catch (err) {
      toast({
        title: tc('status.error'),
        description: err instanceof ApiError ? err.message : 'Création impossible',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (plan: ApiPlan) => {
    try {
      await apiClient.patch(`/subscriptions/plans/${plan.id}`, { isActive: !plan.isActive });
      await load();
    } catch (e) {
      toast({
        title: tc('status.error'),
        description: e instanceof ApiError ? e.message : 'Mise à jour impossible',
        variant: 'destructive',
      });
    }
  };

  const toggleFeatured = async (plan: ApiPlan) => {
    const features = { ...parseFeatures(plan.features), featured: !parseFeatures(plan.features).featured };
    try {
      await apiClient.patch(`/subscriptions/plans/${plan.id}`, { features });
      await load();
    } catch (e) {
      toast({
        title: tc('status.error'),
        description: e instanceof ApiError ? e.message : 'Mise à jour impossible',
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return <LoadingState label="Chargement des plans…" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-[#0B1F3A]">
            Plans tarifaires
          </h1>
          <p className="mt-1 text-slate-500">
            Gérez les offres affichées sur la page d’accueil publique — pas une souscription personnelle.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void load()} disabled={saving}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Actualiser
          </Button>
          {plans.length === 0 && (
            <Button onClick={() => void seedPublic()} disabled={saving} className="bg-[#1D70D8] hover:bg-[#185CB4]">
              <Sparkles className="mr-2 h-4 w-4" />
              Initialiser Essentiel / Performance / Réseau
            </Button>
          )}
        </div>
      </div>

      {plans.length === 0 ? (
        <EmptyState
          title="Aucun plan configuré"
          description="Initialisez ou resynchronisez le catalogue public (3 offres : marketing, entitlements et quotas soft)."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {plans.map((plan) => {
            const features = parseFeatures(plan.features);
            return (
              <Card key={plan.id} className={features.featured ? 'border-[#1D70D8] shadow-md' : ''}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-lg">{plan.name}</CardTitle>
                    <div className="flex flex-wrap gap-1">
                      {plan.isActive ? (
                        <Badge>Actif</Badge>
                      ) : (
                        <Badge variant="secondary">Masqué</Badge>
                      )}
                      {features.featured && <Badge className="bg-[#1D70D8]">Mis en avant</Badge>}
                    </div>
                  </div>
                  <CardDescription>{features.description || '—'}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="font-display text-xl font-bold text-[#0B1F3A]">
                    {features.priceLabel || 'Sur devis'}
                  </p>
                  <ul className="space-y-1 text-sm text-slate-600">
                    {(features.featureList || []).slice(0, 6).map((f) => (
                      <li key={f}>• {f}</li>
                    ))}
                  </ul>
                  <div className="flex flex-wrap gap-2 border-t pt-3">
                    <Button size="sm" variant="outline" onClick={() => void toggleActive(plan)}>
                      {plan.isActive ? 'Masquer de l’accueil' : 'Publier sur l’accueil'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => void toggleFeatured(plan)}>
                      {features.featured ? 'Retirer « recommandé »' : 'Marquer recommandé'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Plus className="h-5 w-5 text-[#1D70D8]" />
            Ajouter un plan
          </CardTitle>
          <CardDescription>Le plan apparaîtra sur l’accueil s’il est actif.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={createPlan} className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="plan-name">Nom</Label>
              <Input
                id="plan-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ex. Essentiel"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-price-label">Libellé prix</Label>
              <Input
                id="plan-price-label"
                value={form.priceLabel}
                onChange={(e) => setForm({ ...form, priceLabel: e.target.value })}
                placeholder="Sur devis"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="plan-desc">Description</Label>
              <Input
                id="plan-desc"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="plan-features">Fonctionnalités (une par ligne)</Label>
              <Textarea
                id="plan-features"
                rows={4}
                value={form.featureList}
                onChange={(e) => setForm({ ...form, featureList: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-cta">Lien CTA</Label>
              <Input
                id="plan-cta"
                value={form.ctaPath}
                onChange={(e) => setForm({ ...form, ctaPath: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-order">Ordre d’affichage</Label>
              <Input
                id="plan-order"
                type="number"
                value={form.sortOrder}
                onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={form.featured}
                onCheckedChange={(checked) => setForm({ ...form, featured: checked })}
                id="plan-featured"
              />
              <Label htmlFor="plan-featured" className="font-normal">
                Mis en avant (recommandé)
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={form.isActive}
                onCheckedChange={(checked) => setForm({ ...form, isActive: checked })}
                id="plan-active"
              />
              <Label htmlFor="plan-active" className="font-normal">
                Actif sur l’accueil
              </Label>
            </div>
            <div className="md:col-span-2">
              <Button type="submit" disabled={saving} className="bg-[#1D70D8] hover:bg-[#185CB4]">
                <CreditCard className="mr-2 h-4 w-4" />
                Créer le plan
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default PublicOffersCatalogAdmin;
