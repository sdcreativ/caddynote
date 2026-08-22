import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { getStudentHealth, upsertStudentHealth } from '@/services/strkStudentHealthService';
import { ApiError } from '@/lib/apiClient';

export function StudentHealthForm({ studentId }: { studentId: string }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    bloodType: '',
    allergies: '',
    medicalConditions: '',
    medications: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    additionalNotes: '',
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const info = await getStudentHealth(studentId);
        if (info) {
          setForm({
            bloodType: info.bloodType || '',
            allergies: info.allergies || '',
            medicalConditions: info.medicalConditions || '',
            medications: info.medications || '',
            emergencyContactName: info.emergencyContactName || '',
            emergencyContactPhone: info.emergencyContactPhone || '',
            additionalNotes: info.additionalNotes || '',
          });
        }
      } catch {
        /* empty ok */
      } finally {
        setLoading(false);
      }
    })();
  }, [studentId]);

  const save = async () => {
    try {
      await upsertStudentHealth(studentId, form);
      toast({ title: 'Fiche santé enregistrée' });
    } catch (e) {
      toast({
        title: 'Échec',
        description: e instanceof ApiError ? e.message : 'Erreur',
        variant: 'destructive',
      });
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground">Chargement…</p>;

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="space-y-1">
        <Label>Groupe sanguin</Label>
        <Input value={form.bloodType} onChange={(e) => setForm({ ...form, bloodType: e.target.value })} />
      </div>
      <div className="space-y-1">
        <Label>Allergies</Label>
        <Input value={form.allergies} onChange={(e) => setForm({ ...form, allergies: e.target.value })} />
      </div>
      <div className="space-y-1">
        <Label>Conditions médicales</Label>
        <Input
          value={form.medicalConditions}
          onChange={(e) => setForm({ ...form, medicalConditions: e.target.value })}
        />
      </div>
      <div className="space-y-1">
        <Label>Médicaments</Label>
        <Input value={form.medications} onChange={(e) => setForm({ ...form, medications: e.target.value })} />
      </div>
      <div className="space-y-1">
        <Label>Contact d’urgence</Label>
        <Input
          value={form.emergencyContactName}
          onChange={(e) => setForm({ ...form, emergencyContactName: e.target.value })}
        />
      </div>
      <div className="space-y-1">
        <Label>Téléphone d’urgence</Label>
        <Input
          value={form.emergencyContactPhone}
          onChange={(e) => setForm({ ...form, emergencyContactPhone: e.target.value })}
        />
      </div>
      <div className="space-y-1 md:col-span-2">
        <Label>Notes</Label>
        <Textarea
          rows={3}
          value={form.additionalNotes}
          onChange={(e) => setForm({ ...form, additionalNotes: e.target.value })}
        />
      </div>
      <div>
        <Button type="button" onClick={() => void save()}>
          Enregistrer
        </Button>
      </div>
    </div>
  );
}
