import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { ApiError } from '@/lib/apiClient';
import {
  provisionDemoFromContact,
  type ContactOpsMessage,
  type ProvisionDemoResult,
} from '@/services/strkSupportService';

type InstitutionType =
  | 'school'
  | 'high_school'
  | 'middle_school'
  | 'university'
  | 'training_center'
  | 'elementary_school'
  | 'private_school';

const splitName = (fullName: string) => {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: 'Admin' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
};

interface ProvisionDemoFromContactDialogProps {
  contact: ContactOpsMessage | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProvisioned: (result: ProvisionDemoResult) => void;
}

export default function ProvisionDemoFromContactDialog({
  contact,
  open,
  onOpenChange,
  onProvisioned,
}: ProvisionDemoFromContactDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const defaults = useMemo(() => {
    if (!contact) {
      return {
        institutionName: '',
        institutionType: 'private_school' as InstitutionType,
        adminEmail: '',
        adminFirstName: '',
        adminLastName: '',
      };
    }
    const { firstName, lastName } = splitName(contact.name);
    return {
      institutionName: `Établissement — ${contact.name}`,
      institutionType: 'private_school' as InstitutionType,
      adminEmail: contact.email,
      adminFirstName: firstName,
      adminLastName: lastName,
    };
  }, [contact]);

  const [form, setForm] = useState(defaults);
  useEffect(() => {
    if (open) setForm(defaults);
  }, [open, defaults]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contact) return;
    if (!form.institutionName.trim() || !form.adminEmail.trim()) {
      toast({
        title: 'Champs requis',
        description: 'Nom d’établissement et e-mail admin sont obligatoires.',
        variant: 'destructive',
      });
      return;
    }
    setLoading(true);
    try {
      const result = await provisionDemoFromContact(contact.id, {
        institutionName: form.institutionName.trim(),
        institutionType: form.institutionType,
        adminEmail: form.adminEmail.trim(),
        adminFirstName: form.adminFirstName.trim() || undefined,
        adminLastName: form.adminLastName.trim() || undefined,
      });
      onProvisioned(result);
      onOpenChange(false);
      toast({
        title: result.alreadyProvisioned ? 'Session déjà créée' : 'Session démo créée',
        description: result.alreadyProvisioned
          ? `${result.institution.name} — ${result.admin.email}`
          : `${result.institution.name} · admin ${result.admin.email}` +
            (result.emailSent
              ? ' · invitation envoyée'
              : result.tempPassword
                ? ` · MDP temporaire : ${result.tempPassword}`
                : ''),
      });
    } catch (error) {
      toast({
        title: 'Création impossible',
        description: error instanceof ApiError ? error.message : 'Erreur',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Créer la session démo</DialogTitle>
          <DialogDescription>
            En une étape : établissement (essai Performance), compte direction, invitation
            e-mail et ticket ops lié.
          </DialogDescription>
        </DialogHeader>
        {contact ? (
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              Contact : {contact.name} &lt;{contact.email}&gt;
              <br />
              Objet : {contact.subject}
            </div>
            <div className="space-y-2">
              <Label htmlFor="demo-inst-name">Nom de l’établissement</Label>
              <Input
                id="demo-inst-name"
                value={form.institutionName}
                onChange={(e) => setForm((f) => ({ ...f, institutionName: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="demo-inst-type">Type</Label>
              <Select
                value={form.institutionType}
                onValueChange={(value) =>
                  setForm((f) => ({ ...f, institutionType: value as InstitutionType }))
                }
              >
                <SelectTrigger id="demo-inst-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="private_school">École privée</SelectItem>
                  <SelectItem value="elementary_school">École primaire</SelectItem>
                  <SelectItem value="middle_school">Collège</SelectItem>
                  <SelectItem value="high_school">Lycée</SelectItem>
                  <SelectItem value="school">École</SelectItem>
                  <SelectItem value="university">Université</SelectItem>
                  <SelectItem value="training_center">Centre de formation</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="demo-admin-first">Prénom admin</Label>
                <Input
                  id="demo-admin-first"
                  value={form.adminFirstName}
                  onChange={(e) => setForm((f) => ({ ...f, adminFirstName: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="demo-admin-last">Nom admin</Label>
                <Input
                  id="demo-admin-last"
                  value={form.adminLastName}
                  onChange={(e) => setForm((f) => ({ ...f, adminLastName: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="demo-admin-email">E-mail admin (connexion)</Label>
              <Input
                id="demo-admin-email"
                type="email"
                value={form.adminEmail}
                onChange={(e) => setForm((f) => ({ ...f, adminEmail: e.target.value }))}
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                Annuler
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? 'Création…' : 'Créer la session'}
              </Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
