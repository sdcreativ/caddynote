import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { QuotasAndFlagsPanel } from '@/components/admin/QuotasAndFlagsPanel';
import { DespsOpsPanel, isDespsPreviewEnabled } from '@/components/admin/DespsOpsPanel';
import { apiClient, ApiError } from '@/lib/apiClient';
import {
  getMaintenanceMode,
  setMaintenanceMode,
  getCommsKillSwitch,
  setCommsKillSwitch,
  getPlatformFlags,
  setPlatformFlags,
  type CommsKillSwitch,
  type PlatformFlags,
} from '@/services/strkOpsService';
import { useToast } from '@/hooks/use-toast';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { Settings, Wrench, Ban, Flag, Megaphone, Handshake, Plus, X, Quote, Phone, BarChart3, HelpCircle } from 'lucide-react';
import { currentSchoolYear } from '@/lib/schoolYear';
import { Textarea } from '@/components/ui/textarea';

const DEFAULT_PLATFORM_KEYS = [
  'finance',
  'communications',
  'admissions',
  'documents',
  'exercises_ai',
  'canteen',
  'lot9_services',
  'advancedReports',
];

/**
 * Configuration plateforme : maintenance, kill-switch, flags globaux,
 * quotas / feature flags par établissement.
 */
const PlatformSettings = () => {
  const { toast } = useToast();
  const confirm = useConfirmDialog();
  const [institutions, setInstitutions] = useState<{ id: string; name: string }[]>([]);
  const [institutionId, setInstitutionId] = useState('');
  const [loading, setLoading] = useState(true);
  const [maintenance, setMaintenance] = useState(false);
  const [maintenanceBusy, setMaintenanceBusy] = useState(false);
  const [kill, setKill] = useState<CommsKillSwitch>({ email: false, sms: false, whatsapp: false });
  const [killBusy, setKillBusy] = useState(false);
  const [flags, setFlags] = useState<PlatformFlags>({});
  const [newFlagKey, setNewFlagKey] = useState('');
  const [flagsBusy, setFlagsBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const [{ institutions: list }, maint, killSw, plat] = await Promise.all([
          apiClient.get<{ institutions: any[] }>('/institutions'),
          getMaintenanceMode().catch(() => false),
          getCommsKillSwitch().catch(() => ({ email: false, sms: false, whatsapp: false })),
          getPlatformFlags().catch(() => ({})),
        ]);
        const mapped = (list || []).map((i) => ({ id: i.id, name: i.name }));
        setInstitutions(mapped);
        if (mapped[0]) setInstitutionId(mapped[0].id);
        setMaintenance(maint);
        setKill(killSw);
        setFlags(plat);
      } catch {
        setInstitutions([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const onMaintenanceChange = async (enabled: boolean) => {
    if (enabled) {
      const ok = await confirm({
        description:
          'Activer le mode maintenance ? Les non-admins recevront un 503 (sauf /health, /auth, webhooks).',
        variant: 'default',
      });
      if (!ok) return;
    }
    setMaintenanceBusy(true);
    try {
      await setMaintenanceMode(enabled);
      setMaintenance(enabled);
      toast({
        title: enabled ? 'Maintenance activée' : 'Maintenance désactivée',
      });
    } catch (e) {
      toast({
        title: 'Impossible de changer le mode',
        description: e instanceof ApiError ? e.message : 'Erreur',
        variant: 'destructive',
      });
    } finally {
      setMaintenanceBusy(false);
    }
  };

  const onKillChange = async (channel: keyof CommsKillSwitch, enabled: boolean) => {
    const next = { ...kill, [channel]: enabled };
    setKillBusy(true);
    try {
      await setCommsKillSwitch(next);
      setKill(next);
      toast({
        title: enabled ? `${channel} coupé` : `${channel} rétabli`,
        description: 'Kill-switch plateforme appliqué aux prochains envois.',
      });
    } catch (e) {
      toast({
        title: 'Kill-switch impossible',
        description: e instanceof ApiError ? e.message : 'Erreur',
        variant: 'destructive',
      });
    } finally {
      setKillBusy(false);
    }
  };

  const persistFlags = async (next: PlatformFlags) => {
    setFlagsBusy(true);
    try {
      await setPlatformFlags(next);
      setFlags(next);
      toast({ title: 'Flags plateforme enregistrés' });
    } catch (e) {
      toast({
        title: 'Flags impossibles',
        description: e instanceof ApiError ? e.message : 'Erreur',
        variant: 'destructive',
      });
    } finally {
      setFlagsBusy(false);
    }
  };

  const flagKeys = Array.from(new Set([...DEFAULT_PLATFORM_KEYS, ...Object.keys(flags)]));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-2xl font-bold">
          <Settings className="h-6 w-6" />
          Configuration plateforme
        </h2>
        <p className="text-sm text-muted-foreground">
          Maintenance, kill-switch canaux, flags globaux, puis quotas par établissement.
        </p>
      </div>

      <AnnouncementPanel />
      <PartnersPanel />
      <TestimonialsPanel />
      <PublicContactPanel />
      <PublicStatsPanel />
      <PublicFaqPanel />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wrench className="h-4 w-4" /> Mode maintenance
          </CardTitle>
          <CardDescription>
            Persisté en settings système. Bypass JWT rôle admin + chemins health/auth/webhook.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">
              {maintenance ? 'Plateforme en maintenance' : 'Plateforme ouverte'}
            </p>
          </div>
          <Switch
            checked={maintenance}
            disabled={maintenanceBusy || loading}
            onCheckedChange={(v) => void onMaintenanceChange(v)}
            aria-label="Mode maintenance"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Ban className="h-4 w-4" /> Kill-switch SMS / e-mail / WhatsApp
          </CardTitle>
          <CardDescription>
            Coupe les envois plateforme immédiatement (push reste actif).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(['email', 'sms', 'whatsapp'] as const).map((ch) => (
            <div key={ch} className="flex items-center justify-between gap-4">
              <Label className="capitalize">{ch}</Label>
              <Switch
                checked={kill[ch]}
                disabled={killBusy || loading}
                onCheckedChange={(v) => void onKillChange(ch, v)}
                aria-label={`Kill ${ch}`}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Flag className="h-4 w-4" /> Feature flags plateforme
          </CardTitle>
          <CardDescription>
            Priorité sur les overrides établissement et le plan. Absent = hérité.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {flagKeys.map((key) => (
            <div key={key} className="flex items-center justify-between gap-4">
              <Label className="font-mono text-sm">{key}</Label>
              <div className="flex items-center gap-2">
                <Switch
                  checked={flags[key] === true}
                  disabled={flagsBusy}
                  onCheckedChange={(v) => void persistFlags({ ...flags, [key]: v })}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={flagsBusy || !(key in flags)}
                  onClick={() => {
                    const next = { ...flags };
                    delete next[key];
                    void persistFlags(next);
                  }}
                >
                  Hériter
                </Button>
              </div>
            </div>
          ))}
          <div className="flex max-w-md gap-2 pt-2">
            <Input
              placeholder="nouvelle_clé"
              value={newFlagKey}
              onChange={(e) => setNewFlagKey(e.target.value)}
            />
            <Button
              type="button"
              variant="outline"
              disabled={!newFlagKey.trim()}
              onClick={() => {
                const key = newFlagKey.trim();
                setNewFlagKey('');
                void persistFlags({ ...flags, [key]: true });
              }}
            >
              Ajouter
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Établissement cible</CardTitle>
          <CardDescription>Quotas et flags par tenant.</CardDescription>
        </CardHeader>
        <CardContent className="max-w-md space-y-2">
          <Label>Établissement</Label>
          <Select
            value={institutionId}
            onValueChange={setInstitutionId}
            disabled={loading || institutions.length === 0}
          >
            <SelectTrigger>
              <SelectValue placeholder={loading ? 'Chargement…' : 'Choisir…'} />
            </SelectTrigger>
            <SelectContent>
              {institutions.map((i) => (
                <SelectItem key={i.id} value={i.id}>
                  {i.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {institutionId ? <QuotasAndFlagsPanel institutionId={institutionId} /> : null}
      {isDespsPreviewEnabled() ? <DespsOpsPanel institutions={institutions} /> : null}

      <SaaSOpsControls />
    </div>
  );
};

/** Bandeau d'annonce publique (flash info). */
interface AnnouncementData {
  text: string;
  shortText: string;
  ctaLabel: string;
  ctaUrl: string;
  showYear: boolean;
  enabled: boolean;
}

const ANNOUNCE_DEFAULTS: AnnouncementData = {
  text: '',
  shortText: '',
  ctaLabel: '',
  ctaUrl: '',
  showYear: true,
  enabled: false,
};

const AnnouncementPanel = () => {
  const { toast } = useToast();
  const [data, setData] = useState<AnnouncementData>(ANNOUNCE_DEFAULTS);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await apiClient.get<{ announcement: AnnouncementData }>('/admin/announcement');
        setData(res.announcement ?? ANNOUNCE_DEFAULTS);
      } catch { /* first time: no data yet */ }
      setLoaded(true);
    })();
  }, []);

  const save = async () => {
    setBusy(true);
    try {
      await apiClient.put('/admin/announcement', data);
      toast({ title: 'Bandeau enregistré' });
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

  const year = currentSchoolYear();
  const preview = `${data.text}${data.showYear ? ` ${year}` : ''}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Megaphone className="h-4 w-4" /> Bandeau d'annonce (flash info)
        </CardTitle>
        <CardDescription>
          Texte affiché sur la barre bleu nuit du site public. L'année scolaire ({year}) est ajoutée automatiquement si activée.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <Label>Bandeau actif</Label>
          <Switch
            checked={data.enabled}
            disabled={!loaded || busy}
            onCheckedChange={(v) => setData((d) => ({ ...d, enabled: v }))}
            aria-label="Activer le bandeau"
          />
        </div>

        <div className="space-y-1">
          <Label>Texte (desktop)</Label>
          <Textarea
            value={data.text}
            onChange={(e) => setData((d) => ({ ...d, text: e.target.value }))}
            placeholder="CaddyNote accompagne la rentrée scolaire"
            maxLength={300}
            rows={2}
          />
        </div>

        <div className="space-y-1">
          <Label>Texte court (mobile)</Label>
          <Input
            value={data.shortText}
            onChange={(e) => setData((d) => ({ ...d, shortText: e.target.value }))}
            placeholder="Rentrée — présentation sur demande"
            maxLength={200}
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <Label>Ajouter l'année scolaire ({year})</Label>
          <Switch
            checked={data.showYear}
            disabled={busy}
            onCheckedChange={(v) => setData((d) => ({ ...d, showYear: v }))}
            aria-label="Afficher l'année scolaire"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Bouton (label)</Label>
            <Input
              value={data.ctaLabel}
              onChange={(e) => setData((d) => ({ ...d, ctaLabel: e.target.value }))}
              placeholder="Demander une présentation"
              maxLength={120}
            />
          </div>
          <div className="space-y-1">
            <Label>Bouton (URL)</Label>
            <Input
              value={data.ctaUrl}
              onChange={(e) => setData((d) => ({ ...d, ctaUrl: e.target.value }))}
              placeholder="/contact?subject=..."
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground">
              Chemin interne uniquement (/contact). Pas d’URL externe.
            </p>
          </div>
        </div>

        {data.text && (
          <div className="rounded-md px-4 py-2 text-center text-xs text-white" style={{ backgroundColor: '#0B1F3A' }}>
            <span className="font-medium text-white/90">{preview}</span>
            {data.ctaLabel && (
              <span className="ml-3 font-semibold text-[#7EB6FF]">{data.ctaLabel} →</span>
            )}
          </div>
        )}

        <Button onClick={() => void save()} disabled={busy || !loaded}>
          Enregistrer le bandeau
        </Button>
      </CardContent>
    </Card>
  );
};

const MAX_PARTNERS = 12;

/** Établissements consentants affichés sur la vitrine (noms seuls). */
const PartnersPanel = () => {
  const { toast } = useToast();
  const [names, setNames] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await apiClient.get<{ names: string[] }>('/admin/partners');
        setNames(res.names ?? []);
      } catch {
        /* first time: no data yet */
      }
      setLoaded(true);
    })();
  }, []);

  const addName = () => {
    const name = draft.trim();
    if (!name) return;
    if (names.length >= MAX_PARTNERS) {
      toast({ title: `Maximum ${MAX_PARTNERS} noms`, variant: 'destructive' });
      return;
    }
    if (names.some((existing) => existing.toLocaleLowerCase('fr') === name.toLocaleLowerCase('fr'))) {
      toast({ title: 'Nom déjà présent', variant: 'destructive' });
      return;
    }
    setNames((prev) => [...prev, name]);
    setDraft('');
  };

  const save = async () => {
    setBusy(true);
    try {
      const res = await apiClient.put<{ names: string[] }>('/admin/partners', { names });
      setNames(res.names);
      toast({
        title: res.names.length > 0 ? 'Liste enregistrée' : 'Bandeau masqué (liste vide)',
      });
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Handshake className="h-4 w-4" /> Ils nous font confiance
        </CardTitle>
        <CardDescription>
          Noms affichés sur le site public, uniquement avec consentement de l’établissement.
          Liste vide = bandeau masqué. Maximum {MAX_PARTNERS} noms, pas de logos.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {names.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun nom publié. Le bandeau vitrine est masqué.</p>
        ) : (
          <ul className="space-y-2">
            {names.map((name) => (
              <li key={name} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                <span className="text-sm font-medium">{name}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setNames((prev) => prev.filter((item) => item !== name))}
                  aria-label={`Retirer ${name}`}
                >
                  <X className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex max-w-md gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Nom de l’établissement"
            maxLength={80}
            disabled={!loaded || busy || names.length >= MAX_PARTNERS}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addName();
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            disabled={!loaded || busy || !draft.trim() || names.length >= MAX_PARTNERS}
            onClick={addName}
          >
            <Plus className="mr-1 h-4 w-4" />
            Ajouter
          </Button>
        </div>

        <Button onClick={() => void save()} disabled={busy || !loaded}>
          Enregistrer la liste
        </Button>
      </CardContent>
    </Card>
  );
};

type VitrinePayload = {
  testimonials: { quote: string; name: string; role: string; place: string }[];
  contact: { email: string; phone: string; whatsapp: string };
  stats: { schools: number | null; students: number | null };
  faq: { q: string; a: string }[];
};

const loadVitrine = () => apiClient.get<VitrinePayload>('/admin/vitrine');

const TestimonialsPanel = () => {
  const { toast } = useToast();
  const [items, setItems] = useState<VitrinePayload['testimonials']>([]);
  const [draft, setDraft] = useState({ quote: '', name: '', role: '', place: '' });
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await loadVitrine();
        setItems(res.testimonials ?? []);
      } catch {
        /* first time */
      }
      setLoaded(true);
    })();
  }, []);

  const addItem = () => {
    if (items.length >= 8) {
      toast({ title: 'Maximum 8 témoignages', variant: 'destructive' });
      return;
    }
    if (draft.quote.trim().length < 10 || !draft.name.trim() || !draft.role.trim() || !draft.place.trim()) {
      toast({ title: 'Citation (≥ 10 car.), nom, rôle et lieu requis', variant: 'destructive' });
      return;
    }
    setItems((prev) => [...prev, { ...draft, quote: draft.quote.trim(), name: draft.name.trim(), role: draft.role.trim(), place: draft.place.trim() }]);
    setDraft({ quote: '', name: '', role: '', place: '' });
  };

  const save = async () => {
    setBusy(true);
    try {
      const res = await apiClient.put<{ items: VitrinePayload['testimonials'] }>('/admin/vitrine/testimonials', { items });
      setItems(res.items);
      toast({ title: res.items.length ? 'Témoignages enregistrés' : 'Section masquée (liste vide)' });
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Quote className="h-4 w-4" /> Ils parlent de CaddyNote
        </CardTitle>
        <CardDescription>
          Avis réels uniquement, avec consentement. Liste vide = section masquée. Maximum 8.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun avis publié. La section vitrine est masquée.</p>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <li key={`${item.name}-${item.quote}`} className="rounded-md border px-3 py-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{item.name} — {item.role}, {item.place}</p>
                    <p className="mt-1 text-sm text-muted-foreground">« {item.quote} »</p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => setItems((prev) => prev.filter((row) => row !== item))}
                    aria-label={`Retirer ${item.name}`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <Textarea
          value={draft.quote}
          onChange={(e) => setDraft((d) => ({ ...d, quote: e.target.value }))}
          placeholder="Citation (consentement requis)"
          maxLength={400}
          rows={3}
          disabled={!loaded || busy || items.length >= 8}
        />
        <div className="grid gap-2 sm:grid-cols-3">
          <Input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Nom" maxLength={80} disabled={!loaded || busy} />
          <Input value={draft.role} onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value }))} placeholder="Rôle" maxLength={80} disabled={!loaded || busy} />
          <Input value={draft.place} onChange={(e) => setDraft((d) => ({ ...d, place: e.target.value }))} placeholder="Ville / établissement" maxLength={80} disabled={!loaded || busy} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={!loaded || busy || items.length >= 8} onClick={addItem}>
            <Plus className="mr-1 h-4 w-4" /> Ajouter
          </Button>
          <Button onClick={() => void save()} disabled={busy || !loaded}>Enregistrer les témoignages</Button>
        </div>
      </CardContent>
    </Card>
  );
};

const PublicContactPanel = () => {
  const { toast } = useToast();
  const [contact, setContact] = useState({ email: 'contact@caddynote.com', phone: '', whatsapp: '' });
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await loadVitrine();
        setContact(res.contact);
      } catch {
        /* first time */
      }
      setLoaded(true);
    })();
  }, []);

  const save = async () => {
    setBusy(true);
    try {
      const res = await apiClient.put<VitrinePayload['contact']>('/admin/vitrine/contact', contact);
      setContact(res);
      toast({ title: 'Coordonnées enregistrées' });
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Phone className="h-4 w-4" /> Coordonnées publiques
        </CardTitle>
        <CardDescription>
          Footer, page Contact et À propos. Téléphone et WhatsApp : laisser vide pour ne rien afficher.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <Label>E-mail</Label>
          <Input value={contact.email} onChange={(e) => setContact((c) => ({ ...c, email: e.target.value }))} placeholder="contact@caddynote.com" maxLength={120} disabled={!loaded || busy} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Téléphone</Label>
            <Input value={contact.phone} onChange={(e) => setContact((c) => ({ ...c, phone: e.target.value }))} placeholder="+225 …" maxLength={24} disabled={!loaded || busy} />
          </div>
          <div className="space-y-1">
            <Label>WhatsApp</Label>
            <Input value={contact.whatsapp} onChange={(e) => setContact((c) => ({ ...c, whatsapp: e.target.value }))} placeholder="+225 …" maxLength={24} disabled={!loaded || busy} />
          </div>
        </div>
        <Button onClick={() => void save()} disabled={busy || !loaded}>Enregistrer les coordonnées</Button>
      </CardContent>
    </Card>
  );
};

const PublicStatsPanel = () => {
  const { toast } = useToast();
  const [schools, setSchools] = useState('');
  const [students, setStudents] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await loadVitrine();
        setSchools(res.stats.schools != null ? String(res.stats.schools) : '');
        setStudents(res.stats.students != null ? String(res.stats.students) : '');
      } catch {
        /* first time */
      }
      setLoaded(true);
    })();
  }, []);

  const save = async () => {
    setBusy(true);
    try {
      const payload = {
        schools: schools.trim() ? Number(schools) : null,
        students: students.trim() ? Number(students) : null,
      };
      const res = await apiClient.put<VitrinePayload['stats']>('/admin/vitrine/stats', payload);
      setSchools(res.schools != null ? String(res.schools) : '');
      setStudents(res.students != null ? String(res.students) : '');
      toast({ title: res.schools || res.students ? 'Chiffres enregistrés' : 'Bandeau chiffres masqué' });
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BarChart3 className="h-4 w-4" /> Chiffres publics
        </CardTitle>
        <CardDescription>
          Saisie manuelle uniquement — pas de compteur automatique. Laisser vide pour ne rien afficher. Uniquement des chiffres réels.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Établissements</Label>
            <Input type="number" min={1} value={schools} onChange={(e) => setSchools(e.target.value)} placeholder="Vide = masqué" disabled={!loaded || busy} />
          </div>
          <div className="space-y-1">
            <Label>Élèves</Label>
            <Input type="number" min={1} value={students} onChange={(e) => setStudents(e.target.value)} placeholder="Vide = masqué" disabled={!loaded || busy} />
          </div>
        </div>
        <Button onClick={() => void save()} disabled={busy || !loaded}>Enregistrer les chiffres</Button>
      </CardContent>
    </Card>
  );
};

const PublicFaqPanel = () => {
  const { toast } = useToast();
  const [items, setItems] = useState<{ q: string; a: string }[]>([]);
  const [draft, setDraft] = useState({ q: '', a: '' });
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await loadVitrine();
        setItems(res.faq ?? []);
      } catch {
        /* first time */
      }
      setLoaded(true);
    })();
  }, []);

  const addItem = () => {
    if (items.length >= 20) {
      toast({ title: 'Maximum 20 questions', variant: 'destructive' });
      return;
    }
    if (draft.q.trim().length < 5 || draft.a.trim().length < 10) {
      toast({ title: 'Question (≥ 5) et réponse (≥ 10) requises', variant: 'destructive' });
      return;
    }
    setItems((prev) => [...prev, { q: draft.q.trim(), a: draft.a.trim() }]);
    setDraft({ q: '', a: '' });
  };

  const save = async () => {
    setBusy(true);
    try {
      const res = await apiClient.put<{ items: { q: string; a: string }[] }>('/admin/vitrine/faq', { items });
      setItems(res.items);
      toast({
        title: res.items.length ? 'FAQ enregistrée' : 'FAQ du code conservée (liste vide)',
      });
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <HelpCircle className="h-4 w-4" /> FAQ publique
        </CardTitle>
        <CardDescription>
          Page Aide. Tant qu’aucune liste n’est enregistrée, le site garde la FAQ intégrée. Enregistrer une liste la remplace.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune FAQ enregistrée — le site affiche encore les questions livrées avec le produit.</p>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <li key={item.q} className="rounded-md border px-3 py-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{item.q}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{item.a}</p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => setItems((prev) => prev.filter((row) => row !== item))}
                    aria-label={`Retirer ${item.q}`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <Input value={draft.q} onChange={(e) => setDraft((d) => ({ ...d, q: e.target.value }))} placeholder="Question" maxLength={160} disabled={!loaded || busy} />
        <Textarea value={draft.a} onChange={(e) => setDraft((d) => ({ ...d, a: e.target.value }))} placeholder="Réponse" maxLength={1200} rows={3} disabled={!loaded || busy} />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={!loaded || busy} onClick={addItem}>
            <Plus className="mr-1 h-4 w-4" /> Ajouter
          </Button>
          <Button onClick={() => void save()} disabled={busy || !loaded}>Enregistrer la FAQ</Button>
        </div>
      </CardContent>
    </Card>
  );
};

/** Rétention audit, overages, file dunning — réglages §2.4. */
const SaaSOpsControls = () => {
  const { toast } = useToast();
  const [auditDays, setAuditDays] = useState(365);
  const [auditEnabled, setAuditEnabled] = useState(false);
  const [overageMode, setOverageMode] = useState<'hard_block' | 'warn_only'>('hard_block');
  const [dunningCount, setDunningCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const [ret, ov, dun] = await Promise.all([
          apiClient.get<{ days: number; enabled: boolean }>('/admin/audit-retention'),
          apiClient.get<{ mode: 'hard_block' | 'warn_only' }>('/admin/overage-policy'),
          apiClient.get<{ items: unknown[] }>('/admin/dunning-queue'),
        ]);
        setAuditDays(ret.days);
        setAuditEnabled(ret.enabled);
        setOverageMode(ov.mode);
        setDunningCount(dun.items?.length ?? 0);
      } catch {
        /* optional */
      }
    })();
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ops SaaS (§2.4)</CardTitle>
        <CardDescription>
          Rétention audit, politique de dépassement quotas, file dunning. Status public :{' '}
          <a className="underline" href="/status" target="_blank" rel="noreferrer">
            /status
          </a>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label>Rétention audit (jours)</Label>
            <Input
              type="number"
              className="w-28"
              value={auditDays}
              onChange={(e) => setAuditDays(Number(e.target.value) || 365)}
            />
          </div>
          <div className="flex items-center gap-2 pb-2">
            <Switch checked={auditEnabled} onCheckedChange={setAuditEnabled} id="audit-en" />
            <Label htmlFor="audit-en">Purge auto</Label>
          </div>
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={() =>
              void (async () => {
                setBusy(true);
                try {
                  await apiClient.put('/admin/audit-retention', {
                    days: auditDays,
                    enabled: auditEnabled,
                  });
                  toast({ title: 'Rétention audit enregistrée' });
                } catch (e) {
                  toast({
                    title: 'Échec',
                    description: e instanceof ApiError ? e.message : 'Erreur',
                    variant: 'destructive',
                  });
                } finally {
                  setBusy(false);
                }
              })()
            }
          >
            Sauver rétention
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() =>
              void (async () => {
                setBusy(true);
                try {
                  const r = await apiClient.post<{ deleted: number }>('/admin/audit-retention/purge', {});
                  toast({ title: `Purge : ${r.deleted} ligne(s)` });
                } catch (e) {
                  toast({
                    title: 'Purge impossible',
                    description: e instanceof ApiError ? e.message : 'Erreur',
                    variant: 'destructive',
                  });
                } finally {
                  setBusy(false);
                }
              })()
            }
          >
            Purger maintenant
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Label>Dépassement quotas</Label>
          <Select
            value={overageMode}
            onValueChange={(v) => setOverageMode(v as 'hard_block' | 'warn_only')}
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="hard_block">Blocage strict</SelectItem>
              <SelectItem value="warn_only">Autoriser + audit (warn)</SelectItem>
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={() =>
              void (async () => {
                setBusy(true);
                try {
                  await apiClient.put('/admin/overage-policy', { mode: overageMode });
                  toast({ title: 'Politique overage enregistrée' });
                } catch (e) {
                  toast({
                    title: 'Échec',
                    description: e instanceof ApiError ? e.message : 'Erreur',
                    variant: 'destructive',
                  });
                } finally {
                  setBusy(false);
                }
              })()
            }
          >
            Sauver overage
          </Button>
        </div>

        <p className="text-sm text-muted-foreground">
          File dunning (grâce / suspendus) : {dunningCount ?? '—'} abo
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="ml-2"
            disabled={busy}
            onClick={() =>
              void (async () => {
                setBusy(true);
                try {
                  const r = await apiClient.post<{ nudged: number }>('/admin/dunning-run', {});
                  toast({ title: `Dunning : ${r.nudged} relance(s)` });
                } catch (e) {
                  toast({
                    title: 'Dunning impossible',
                    description: e instanceof ApiError ? e.message : 'Erreur',
                    variant: 'destructive',
                  });
                } finally {
                  setBusy(false);
                }
              })()
            }
          >
            Lancer relances
          </Button>
        </p>
      </CardContent>
    </Card>
  );
};

export default PlatformSettings;
