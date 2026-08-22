import { useCallback, useEffect, useState } from 'react';
import { Building2, Plus, Trash2, Link2, Unlink } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { ApiError } from '@/lib/apiClient';
import {
  listGroups,
  createGroup,
  updateGroup,
  deleteGroup,
  attachInstitutionToGroup,
  detachInstitutionFromGroup,
  getGroupDashboard,
  type InstitutionGroup,
} from '@/services/strkOpsService';
import { useStrkInstitutions } from '@/hooks/useStrkInstitutions';

/** CRUD groupes multi-établissements (ORG-002). */
const InstitutionGroupsPanel = () => {
  const { toast } = useToast();
  const confirm = useConfirmDialog();
  const { institutions, loadInstitutions } = useStrkInstitutions();
  const [groups, setGroups] = useState<InstitutionGroup[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [name, setName] = useState('');
  const [attachId, setAttachId] = useState('');
  const [members, setMembers] = useState<
    Array<{ id: string; name: string; students: number; teachers: number; classes: number }>
  >([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const g = await listGroups();
      setGroups(g);
      setSelectedId((prev) => prev || g[0]?.id || '');
    } catch (e) {
      toast({
        title: 'Groupes indisponibles',
        description: e instanceof ApiError ? e.message : 'Erreur',
        variant: 'destructive',
      });
    }
  }, [toast]);

  useEffect(() => {
    void loadInstitutions();
    void load();
  }, [loadInstitutions, load]);

  useEffect(() => {
    if (!selectedId) {
      setMembers([]);
      return;
    }
    void (async () => {
      try {
        const dash = await getGroupDashboard(selectedId);
        setMembers(dash.institutions);
        const g = groups.find((x) => x.id === selectedId);
        if (g) setName(g.name);
      } catch {
        setMembers([]);
      }
    })();
  }, [selectedId, groups]);

  const onCreate = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const g = await createGroup(name.trim());
      toast({ title: 'Groupe créé' });
      await load();
      setSelectedId(g.id);
    } catch (e) {
      toast({
        title: 'Création impossible',
        description: e instanceof ApiError ? e.message : 'Erreur',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const onRename = async () => {
    if (!selectedId || !name.trim()) return;
    setBusy(true);
    try {
      await updateGroup(selectedId, name.trim());
      toast({ title: 'Groupe renommé' });
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

  const onDelete = async () => {
    if (!selectedId) return;
    const ok = await confirm({
      description: 'Supprimer ce groupe (établissements déjà détachés) ?',
      variant: 'destructive',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await deleteGroup(selectedId);
      toast({ title: 'Groupe supprimé' });
      setSelectedId('');
      await load();
    } catch (e) {
      toast({
        title: 'Suppression impossible',
        description: e instanceof ApiError ? e.message : 'Erreur',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const onAttach = async () => {
    if (!selectedId || !attachId) return;
    setBusy(true);
    try {
      await attachInstitutionToGroup(selectedId, attachId);
      toast({ title: 'Établissement rattaché' });
      setAttachId('');
      const dash = await getGroupDashboard(selectedId);
      setMembers(dash.institutions);
      await load();
    } catch (e) {
      toast({
        title: 'Rattachement impossible',
        description: e instanceof ApiError ? e.message : 'Erreur',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const onDetach = async (institutionId: string) => {
    if (!selectedId) return;
    setBusy(true);
    try {
      await detachInstitutionFromGroup(selectedId, institutionId);
      toast({ title: 'Établissement détaché' });
      const dash = await getGroupDashboard(selectedId);
      setMembers(dash.institutions);
      await load();
    } catch (e) {
      toast({
        title: 'Détachement impossible',
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
          <Building2 className="h-4 w-4" /> Groupes multi-établissements
        </CardTitle>
        <CardDescription>CRUD ORG-002 — admin global uniquement.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Groupe</Label>
            <Select value={selectedId || undefined} onValueChange={setSelectedId}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner" />
              </SelectTrigger>
              <SelectContent>
                {groups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name}
                    {g._count?.institutions != null ? ` (${g._count.institutions})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Nom</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom du groupe" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={() => void onCreate()} disabled={busy || !name.trim()}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Créer
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void onRename()}
            disabled={busy || !selectedId || !name.trim()}
          >
            Renommer
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            onClick={() => void onDelete()}
            disabled={busy || !selectedId}
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" />
            Supprimer
          </Button>
        </div>

        {selectedId && (
          <>
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[200px] flex-1 space-y-2">
                <Label>Rattacher un établissement</Label>
                <Select value={attachId || undefined} onValueChange={setAttachId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Établissement" />
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
              <Button type="button" size="sm" onClick={() => void onAttach()} disabled={busy || !attachId}>
                <Link2 className="mr-1 h-3.5 w-3.5" />
                Rattacher
              </Button>
            </div>
            <ul className="max-h-40 space-y-1 overflow-y-auto text-sm">
              {members.length === 0 ? (
                <li className="text-muted-foreground">Aucun établissement dans ce groupe.</li>
              ) : (
                members.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-2 border-b py-1">
                    <span>
                      {m.name}{' '}
                      <span className="text-xs text-muted-foreground">
                        · {m.students} él. · {m.teachers} ens.
                      </span>
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => void onDetach(m.id)}
                      disabled={busy}
                    >
                      <Unlink className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))
              )}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default InstitutionGroupsPanel;
