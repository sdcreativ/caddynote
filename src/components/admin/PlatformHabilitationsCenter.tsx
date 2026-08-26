import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiClient } from '@/lib/apiClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { usePlatformPermissions } from '@/hooks/usePlatformPermissions';

type PlatformRoleRow = {
  code: string;
  label: string;
  level: number;
  description: string;
  permissionCount: number;
};

type AdminUser = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  role: string;
};

const PlatformHabilitationsCenter = () => {
  const { toast } = useToast();
  const { hasPermission, reload: reloadMe } = usePlatformPermissions();
  const canManage = hasPermission('platform.rbac.manage');

  const [roles, setRoles] = useState<PlatformRoleRow[]>([]);
  const [superAdmin, setSuperAdmin] = useState<{ active: number; max: number } | null>(null);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const [countryCode, setCountryCode] = useState('');
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');

  const loadCatalog = useCallback(async () => {
    const res = await apiClient.get<{
      roles: PlatformRoleRow[];
      superAdmin: { active: number; max: number };
    }>('/admin/platform-rbac/roles');
    setRoles(res.roles);
    setSuperAdmin(res.superAdmin);
  }, []);

  const loadAdmins = useCallback(async () => {
    const res = await apiClient.get<{ users: AdminUser[] }>('/users');
    setAdmins((res.users ?? []).filter((u) => u.role === 'admin'));
  }, []);

  useEffect(() => {
    void loadCatalog().catch(() => {
      toast({ title: 'Erreur', description: 'Impossible de charger le catalogue RBAC.', variant: 'destructive' });
    });
    void loadAdmins().catch(() => undefined);
  }, [loadCatalog, loadAdmins, toast]);

  const filteredAdmins = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return admins;
    return admins.filter((u) =>
      [u.email, u.firstName, u.lastName].filter(Boolean).join(' ').toLowerCase().includes(q)
    );
  }, [admins, query]);

  const loadUserRoles = async (userId: string) => {
    setSelectedUserId(userId);
    const res = await apiClient.get<{
      assignments: { roleCode: string; active: boolean }[];
      effective: { roleCodes: string[] };
    }>(`/admin/platform-rbac/users/${userId}/roles`);
    const codes = res.assignments.filter((a) => a.active).map((a) => a.roleCode);
    setSelectedCodes(codes.length ? codes : res.effective.roleCodes);
  };

  const toggleCode = (code: string, checked: boolean) => {
    setSelectedCodes((prev) => (checked ? [...new Set([...prev, code])] : prev.filter((c) => c !== code)));
  };

  const save = async () => {
    if (!selectedUserId || !canManage) return;
    setSaving(true);
    try {
      await apiClient.put(`/admin/platform-rbac/users/${selectedUserId}/roles`, {
        roleCodes: selectedCodes,
        countryCode: countryCode.trim() ? countryCode.trim().toUpperCase() : null,
      });
      toast({ title: 'Habilitations enregistrées' });
      await loadCatalog();
      await reloadMe();
    } catch (err) {
      toast({
        title: 'Erreur',
        description: err instanceof Error ? err.message : 'Enregistrement impossible',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const byLevel = useMemo(() => {
    const map = new Map<number, PlatformRoleRow[]>();
    for (const r of roles) {
      const list = map.get(r.level) ?? [];
      list.push(r);
      map.set(r.level, list);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [roles]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Habilitations CaddyNote</h2>
        <p className="text-sm text-muted-foreground">
          Rôles d’administration de la plateforme (RBAC) — attribution multi-rôles pour l’équipe éditeur SDCREATIV.
        </p>
        {superAdmin ? (
          <p className="mt-2 text-sm">
            Super administrateurs actifs :{' '}
            <Badge variant="secondary">
              {superAdmin.active} / {superAdmin.max}
            </Badge>
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Comptes admin</CardTitle>
            <CardDescription>Sélectionnez un compte équipe pour éditer ses rôles.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder="Rechercher (e-mail, nom…)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <ul className="max-h-72 space-y-1 overflow-y-auto text-sm">
              {filteredAdmins.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    className={`w-full rounded-md px-3 py-2 text-left hover:bg-muted ${
                      selectedUserId === u.id ? 'bg-muted font-medium' : ''
                    }`}
                    onClick={() => void loadUserRoles(u.id)}
                  >
                    {[u.firstName, u.lastName].filter(Boolean).join(' ') || 'Sans nom'}
                    <span className="block text-xs text-muted-foreground">{u.email}</span>
                  </button>
                </li>
              ))}
              {filteredAdmins.length === 0 ? (
                <li className="text-muted-foreground">Aucun compte admin trouvé.</li>
              ) : null}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Rôles attribués</CardTitle>
            <CardDescription>
              {selectedUserId
                ? canManage
                  ? 'Cochez les rôles compatibles, puis enregistrez.'
                  : 'Lecture seule (permission rbac.manage requise).'
                : 'Choisissez un compte à gauche.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedUserId ? (
              <>
                <div className="max-w-xs space-y-1">
                  <Label htmlFor="country">Pays (optionnel, ISO-2)</Label>
                  <Input
                    id="country"
                    placeholder="CI"
                    maxLength={2}
                    value={countryCode}
                    disabled={!canManage}
                    onChange={(e) => setCountryCode(e.target.value.toUpperCase())}
                  />
                </div>
                <div className="max-h-96 space-y-4 overflow-y-auto pr-1">
                  {byLevel.map(([level, list]) => (
                    <div key={level} className="space-y-2">
                      <p className="text-xs font-semibold uppercase text-muted-foreground">Niveau {level}</p>
                      {list.map((role) => (
                        <label key={role.code} className="flex items-start gap-2 rounded-md border p-2 text-sm">
                          <Checkbox
                            checked={selectedCodes.includes(role.code)}
                            disabled={!canManage}
                            onCheckedChange={(v) => toggleCode(role.code, v === true)}
                          />
                          <span>
                            <span className="font-medium">{role.label}</span>
                            <span className="ml-2 font-mono text-xs text-muted-foreground">{role.code}</span>
                            <span className="mt-0.5 block text-xs text-muted-foreground">{role.description}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
                {canManage ? (
                  <Button type="button" onClick={() => void save()} disabled={saving}>
                    {saving ? 'Enregistrement…' : 'Enregistrer'}
                  </Button>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Aucun utilisateur sélectionné.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PlatformHabilitationsCenter;
