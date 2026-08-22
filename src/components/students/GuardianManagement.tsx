import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { useStrkAuth } from '@/hooks/useStrkAuth';
import { apiClient } from '@/lib/apiClient';
import {
  fetchGuardiansForStudent,
  findGuardianCandidateByEmail,
  linkGuardianToStudent,
  updateGuardianLink,
  deactivateGuardianLink,
} from '@/services/strkGuardianService';
import { StrkStudentGuardian, StrkGuardianRelationship } from '@/types/strk';
import { Star, StarOff, UserPlus, UserX, Search, Loader2, Pencil } from 'lucide-react';

const RELATIONSHIP_LABELS: Record<StrkGuardianRelationship, string> = {
  father: 'Père',
  mother: 'Mère',
  tutor: 'Tuteur/Tutrice',
  payer: 'Payeur',
  other_authorized: 'Autre personne autorisée',
};

interface GuardianManagementProps {
  studentId: string;
  institutionId: string;
}

export const GuardianManagement: React.FC<GuardianManagementProps> = ({ studentId, institutionId }) => {
  const { user } = useStrkAuth();
  const { toast } = useToast();
  const confirm = useConfirmDialog();
  const [guardians, setGuardians] = useState<StrkStudentGuardian[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingGuardian, setEditingGuardian] = useState<StrkStudentGuardian | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchGuardiansForStudent(studentId);
      setGuardians(data.filter((g) => g.status === 'active'));
    } finally {
      setIsLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSetPrimary = async (guardianLink: StrkStudentGuardian) => {
    try {
      await updateGuardianLink(guardianLink.id, { is_primary_contact: true });
      toast({ title: 'Contact principal mis à jour' });
      load();
    } catch {
      toast({ title: 'Erreur', description: "Impossible de mettre à jour le contact principal.", variant: 'destructive' });
    }
  };

  const handleRemove = async (guardianLink: StrkStudentGuardian) => {
    const confirmed = await confirm({
      description: `Retirer ${guardianLink.guardian?.first_name} ${guardianLink.guardian?.last_name} des responsables de cet élève ?`,
      variant: 'destructive',
    });
    if (!confirmed) return;
    const ok = await deactivateGuardianLink(guardianLink.id);
    if (ok) {
      toast({ title: 'Responsable retiré' });
      load();
    } else {
      toast({ title: 'Erreur', description: "Impossible de retirer ce responsable.", variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          Père, mère, tuteur, payeur ou autre personne autorisée, avec des droits différenciés.
        </p>
        <Button size="sm" onClick={() => setShowAddDialog(true)}>
          <UserPlus className="mr-2 h-4 w-4" />
          Ajouter un responsable
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-500">Chargement…</p>
      ) : guardians.length === 0 ? (
        <div className="text-center py-8 border border-dashed rounded-lg">
          <p className="text-sm text-gray-500">Aucun responsable déclaré pour cet élève.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {guardians.map((g) => (
            <Card key={g.id}>
              <CardContent className="p-4 flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">
                      {g.guardian?.first_name} {g.guardian?.last_name}
                    </span>
                    <Badge variant="secondary">{RELATIONSHIP_LABELS[g.relationship]}</Badge>
                    {g.is_primary_contact && (
                      <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Contact principal</Badge>
                    )}
                  </div>
                  <p className="text-sm text-gray-500">{g.guardian?.email}</p>
                  <div className="flex flex-wrap gap-1 pt-1">
                    {g.can_view_grades && <Badge variant="outline">Notes</Badge>}
                    {g.can_view_attendance && <Badge variant="outline">Présence/justificatifs</Badge>}
                    {g.can_view_billing && <Badge variant="outline">Facturation</Badge>}
                    {g.can_make_payments && <Badge variant="outline">Paiements</Badge>}
                    {g.can_receive_communications && <Badge variant="outline">Communications</Badge>}
                    {g.can_authorize_pickup && <Badge variant="outline">Sortie autorisée</Badge>}
                    {g.can_view_health && <Badge variant="outline">Santé</Badge>}
                    {g.can_view_discipline && <Badge variant="outline">Suivi / discipline</Badge>}
                  </div>
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  <Button size="sm" variant="ghost" onClick={() => setEditingGuardian(g)} title="Modifier les droits">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  {!g.is_primary_contact && (
                    <Button size="sm" variant="ghost" onClick={() => handleSetPrimary(g)} title="Définir comme contact principal">
                      <Star className="h-4 w-4" />
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => handleRemove(g)} title="Retirer ce responsable">
                    <UserX className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AddGuardianDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        studentId={studentId}
        institutionId={institutionId}
        createdBy={user?.id}
        onLinked={() => {
          setShowAddDialog(false);
          load();
        }}
      />

      <EditGuardianRightsDialog
        guardian={editingGuardian}
        open={!!editingGuardian}
        onOpenChange={(open) => {
          if (!open) setEditingGuardian(null);
        }}
        onSaved={() => {
          setEditingGuardian(null);
          load();
        }}
      />
    </div>
  );
};

interface AddGuardianDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  institutionId: string;
  createdBy?: string;
  onLinked: () => void;
}

const AddGuardianDialog: React.FC<AddGuardianDialogProps> = ({
  open,
  onOpenChange,
  studentId,
  institutionId,
  createdBy,
  onLinked,
}) => {
  const { toast } = useToast();
  const [step, setStep] = useState<'search' | 'confirm-existing' | 'create-new'>('search');
  const [email, setEmail] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [candidate, setCandidate] = useState<{ id: string; first_name?: string; last_name?: string; email?: string; role: string } | null>(null);
  const [newGuardian, setNewGuardian] = useState({ firstName: '', lastName: '', phoneNumber: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [relationship, setRelationship] = useState<StrkGuardianRelationship>('tutor');
  const [isPrimaryContact, setIsPrimaryContact] = useState(false);
  const [permissions, setPermissions] = useState({
    can_view_grades: true,
    can_view_attendance: true,
    can_view_billing: false,
    can_make_payments: false,
    can_receive_communications: true,
    can_authorize_pickup: false,
    can_view_health: true,
    can_view_discipline: true,
  });

  const reset = () => {
    setStep('search');
    setEmail('');
    setCandidate(null);
    setNewGuardian({ firstName: '', lastName: '', phoneNumber: '' });
    setRelationship('tutor');
    setIsPrimaryContact(false);
    setPermissions({
      can_view_grades: true,
      can_view_attendance: true,
      can_view_billing: false,
      can_make_payments: false,
      can_receive_communications: true,
      can_authorize_pickup: false,
      can_view_health: true,
      can_view_discipline: true,
    });
  };

  useEffect(() => {
    if (!open) reset();
  }, [open]);

  const handleSearch = async () => {
    if (!email.trim()) return;
    setIsSearching(true);
    try {
      const found = await findGuardianCandidateByEmail(email);
      if (found) {
        setCandidate(found);
        setStep('confirm-existing');
      } else {
        setNewGuardian((prev) => ({ ...prev, firstName: prev.firstName }));
        setStep('create-new');
      }
    } catch {
      toast({ title: 'Erreur', description: 'La recherche a échoué.', variant: 'destructive' });
    } finally {
      setIsSearching(false);
    }
  };

  const doLink = async (guardianId: string) => {
    setIsSubmitting(true);
    try {
      await linkGuardianToStudent({
        institution_id: institutionId,
        student_id: studentId,
        guardian_id: guardianId,
        relationship,
        is_primary_contact: isPrimaryContact,
        created_by: createdBy,
        ...permissions,
      });
      toast({ title: 'Responsable lié', description: "Le responsable a été associé à l'élève avec succès." });
      onLinked();
    } catch (error: any) {
      const msg = error?.message?.includes('duplicate')
        ? 'Ce responsable est déjà lié à cet élève.'
        : "Impossible de lier ce responsable.";
      toast({ title: 'Erreur', description: msg, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmExisting = () => {
    if (!candidate) return;
    doLink(candidate.id);
  };

  const handleCreateAndLink = async () => {
    if (!newGuardian.firstName || !newGuardian.lastName || !email.trim()) {
      toast({ title: 'Erreur', description: 'Prénom, nom et e-mail sont obligatoires.', variant: 'destructive' });
      return;
    }
    setIsSubmitting(true);
    try {
      const { user } = await apiClient.post<{ user: { id: string }; tempPassword: string }>('/users', {
        email: email.trim(),
        firstName: newGuardian.firstName,
        lastName: newGuardian.lastName,
        role: 'parent',
        institutionId,
        phoneNumber: newGuardian.phoneNumber || undefined,
      });

      await doLink(user.id);
    } catch (error: any) {
      toast({ title: 'Erreur', description: error.message || 'Impossible de créer ce compte responsable.', variant: 'destructive' });
      setIsSubmitting(false);
    }
  };

  const permissionRow = (
    <div className="space-y-3 pt-2">
      <div className="grid grid-cols-2 gap-2">
        <Label className="flex items-center gap-2 text-sm font-normal">
          <Checkbox
            checked={permissions.can_view_grades}
            onCheckedChange={(v) => setPermissions((p) => ({ ...p, can_view_grades: !!v }))}
          />
          Voir les notes
        </Label>
        <Label className="flex items-center gap-2 text-sm font-normal">
          <Checkbox
            checked={permissions.can_view_attendance}
            onCheckedChange={(v) => setPermissions((p) => ({ ...p, can_view_attendance: !!v }))}
          />
          Voir présence / justifier
        </Label>
        <Label className="flex items-center gap-2 text-sm font-normal">
          <Checkbox
            checked={permissions.can_view_billing}
            onCheckedChange={(v) => setPermissions((p) => ({ ...p, can_view_billing: !!v }))}
          />
          Voir la facturation
        </Label>
        <Label className="flex items-center gap-2 text-sm font-normal">
          <Checkbox
            checked={permissions.can_make_payments}
            onCheckedChange={(v) => setPermissions((p) => ({ ...p, can_make_payments: !!v }))}
          />
          Effectuer des paiements
        </Label>
        <Label className="flex items-center gap-2 text-sm font-normal">
          <Checkbox
            checked={permissions.can_receive_communications}
            onCheckedChange={(v) => setPermissions((p) => ({ ...p, can_receive_communications: !!v }))}
          />
          Recevoir les communications
        </Label>
        <Label className="flex items-center gap-2 text-sm font-normal">
          <Checkbox
            checked={permissions.can_authorize_pickup}
            onCheckedChange={(v) => setPermissions((p) => ({ ...p, can_authorize_pickup: !!v }))}
          />
          Autorisé à récupérer l'enfant
        </Label>
        <Label className="flex items-center gap-2 text-sm font-normal">
          <Checkbox
            checked={permissions.can_view_health}
            onCheckedChange={(v) => setPermissions((p) => ({ ...p, can_view_health: !!v }))}
          />
          Voir la fiche santé
        </Label>
        <Label className="flex items-center gap-2 text-sm font-normal">
          <Checkbox
            checked={permissions.can_view_discipline}
            onCheckedChange={(v) => setPermissions((p) => ({ ...p, can_view_discipline: !!v }))}
          />
          Voir suivi / discipline
        </Label>
      </div>
      <Label className="flex items-center gap-2 text-sm font-normal">
        <Checkbox checked={isPrimaryContact} onCheckedChange={(v) => setIsPrimaryContact(!!v)} />
        Définir comme contact principal
      </Label>
      <div className="space-y-2">
        <Label>Lien avec l'élève</Label>
        <Select value={relationship} onValueChange={(v) => setRelationship(v as StrkGuardianRelationship)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(RELATIONSHIP_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Ajouter un responsable</DialogTitle>
        </DialogHeader>

        {step === 'search' && (
          <div className="space-y-3">
            <Label htmlFor="guardian-email">E-mail du responsable</Label>
            <div className="flex gap-2">
              <Input
                id="guardian-email"
                type="email"
                placeholder="parent@exemple.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Button onClick={handleSearch} disabled={isSearching || !email.trim()}>
                {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-gray-500">
              Si un compte responsable existe déjà avec cet e-mail, il sera proposé pour association. Sinon, un nouveau compte sera créé.
            </p>
          </div>
        )}

        {step === 'confirm-existing' && candidate && (
          <div className="space-y-4">
            <div className="p-3 bg-gray-50 rounded-md">
              <p className="font-medium">{candidate.first_name} {candidate.last_name}</p>
              <p className="text-sm text-gray-500">{candidate.email}</p>
              {candidate.role !== 'parent' && (
                <p className="text-xs text-amber-600 mt-1">
                  ⚠️ Ce compte n'a pas le rôle "responsable" ({candidate.role}). Vérifiez qu'il s'agit bien de la bonne personne.
                </p>
              )}
            </div>
            {permissionRow}
          </div>
        )}

        {step === 'create-new' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">
              Aucun compte trouvé pour <strong>{email}</strong>. Un nouveau compte responsable va être créé et un mot de passe temporaire lui sera envoyé par e-mail.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Prénom *</Label>
                <Input
                  value={newGuardian.firstName}
                  onChange={(e) => setNewGuardian((p) => ({ ...p, firstName: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Nom *</Label>
                <Input
                  value={newGuardian.lastName}
                  onChange={(e) => setNewGuardian((p) => ({ ...p, lastName: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Téléphone</Label>
              <Input
                value={newGuardian.phoneNumber}
                onChange={(e) => setNewGuardian((p) => ({ ...p, phoneNumber: e.target.value }))}
              />
            </div>
            {permissionRow}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          {step === 'confirm-existing' && (
            <Button onClick={handleConfirmExisting} disabled={isSubmitting}>
              {isSubmitting ? 'Association…' : 'Associer ce responsable'}
            </Button>
          )}
          {step === 'create-new' && (
            <Button onClick={handleCreateAndLink} disabled={isSubmitting}>
              {isSubmitting ? 'Création…' : 'Créer et associer'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

interface EditGuardianRightsDialogProps {
  guardian: StrkStudentGuardian | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

const EditGuardianRightsDialog: React.FC<EditGuardianRightsDialogProps> = ({
  guardian,
  open,
  onOpenChange,
  onSaved,
}) => {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [relationship, setRelationship] = useState<StrkGuardianRelationship>('tutor');
  const [isPrimaryContact, setIsPrimaryContact] = useState(false);
  const [permissions, setPermissions] = useState({
    can_view_grades: true,
    can_view_attendance: true,
    can_view_billing: false,
    can_make_payments: false,
    can_receive_communications: true,
    can_authorize_pickup: false,
    can_view_health: true,
    can_view_discipline: true,
  });

  useEffect(() => {
    if (!guardian) return;
    setRelationship(guardian.relationship);
    setIsPrimaryContact(guardian.is_primary_contact);
    setPermissions({
      can_view_grades: guardian.can_view_grades,
      can_view_attendance: guardian.can_view_attendance,
      can_view_billing: guardian.can_view_billing,
      can_make_payments: guardian.can_make_payments,
      can_receive_communications: guardian.can_receive_communications,
      can_authorize_pickup: guardian.can_authorize_pickup,
      can_view_health: guardian.can_view_health,
      can_view_discipline: guardian.can_view_discipline,
    });
  }, [guardian]);

  const handleSave = async () => {
    if (!guardian) return;
    setIsSubmitting(true);
    try {
      await updateGuardianLink(guardian.id, {
        relationship,
        is_primary_contact: isPrimaryContact,
        ...permissions,
      });
      toast({ title: 'Droits mis à jour' });
      onSaved();
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de mettre à jour les droits.', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            Droits — {guardian?.guardian?.first_name} {guardian?.guardian?.last_name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ['can_view_grades', 'Voir les notes'],
                ['can_view_attendance', 'Voir présence / justifier'],
                ['can_view_billing', 'Voir la facturation'],
                ['can_make_payments', 'Effectuer des paiements'],
                ['can_receive_communications', 'Recevoir les communications'],
                ['can_authorize_pickup', "Autorisé à récupérer l'enfant"],
                ['can_view_health', 'Voir la fiche santé'],
                ['can_view_discipline', 'Voir suivi / discipline'],
              ] as const
            ).map(([key, label]) => (
              <Label key={key} className="flex items-center gap-2 text-sm font-normal">
                <Checkbox
                  checked={permissions[key]}
                  onCheckedChange={(v) => setPermissions((p) => ({ ...p, [key]: !!v }))}
                />
                {label}
              </Label>
            ))}
          </div>
          <Label className="flex items-center gap-2 text-sm font-normal">
            <Checkbox checked={isPrimaryContact} onCheckedChange={(v) => setIsPrimaryContact(!!v)} />
            Contact principal
          </Label>
          <div className="space-y-2">
            <Label>Lien avec l'élève</Label>
            <Select value={relationship} onValueChange={(v) => setRelationship(v as StrkGuardianRelationship)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(RELATIONSHIP_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={() => void handleSave()} disabled={isSubmitting}>
            {isSubmitting ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default GuardianManagement;
