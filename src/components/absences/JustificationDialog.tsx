import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from '@/hooks/use-toast';
import { useStrkAbsences } from '@/hooks/useStrkAbsences';
import { uploadViaPresignedPost } from '@/lib/s3Upload';
import { Upload, X } from 'lucide-react';

interface JustificationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  absenceId?: string;
  onJustificationSubmitted?: () => void;
}

export const JustificationDialog = ({ 
  open, 
  onOpenChange, 
  absenceId,
  onJustificationSubmitted 
}: JustificationDialogProps) => {
  const [reason, setReason] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const { updateAbsenceJustification } = useStrkAbsences();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // Vérifier le type et la taille du fichier
      const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
      const maxSize = 5 * 1024 * 1024; // 5MB

      if (!allowedTypes.includes(selectedFile.type)) {
        toast({
          title: "Type de fichier non autorisé",
          description: "Seuls les fichiers PDF, JPEG et PNG sont acceptés.",
          variant: "destructive",
        });
        return;
      }

      if (selectedFile.size > maxSize) {
        toast({
          title: "Fichier trop volumineux",
          description: "Le fichier ne doit pas dépasser 5MB.",
          variant: "destructive",
        });
        return;
      }

      setFile(selectedFile);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!reason.trim()) {
      toast({
        title: "Motif requis",
        description: "Veuillez saisir un motif pour votre absence.",
        variant: "destructive",
      });
      return;
    }

    if (!absenceId) {
      toast({
        title: "Erreur",
        description: "Aucune absence sélectionnée.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      let fileKey: string | undefined;
      if (file) {
        fileKey = await uploadViaPresignedPost('justificatifs', file);
      }

      const result = await updateAbsenceJustification(absenceId, reason, fileKey);
      
      if (result) {
        toast({
          title: "Justificatif envoyé",
          description: "Votre justificatif a été envoyé avec succès.",
        });
        
        setReason('');
        setFile(null);
        onOpenChange(false);
        onJustificationSubmitted?.();
      } else {
        throw new Error('Échec de l\'envoi du justificatif');
      }
    } catch (error) {
      console.error('Error submitting justification:', error);
      toast({
        title: "Erreur",
        description: "Une erreur est survenue lors de l'envoi du justificatif.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const removeFile = () => {
    setFile(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Justifier l'absence</DialogTitle>
          <DialogDescription>
            Fournissez un motif et éventuellement un document justificatif pour votre absence.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reason">Motif de l'absence *</Label>
            <Textarea
              id="reason"
              placeholder="Ex: Rendez-vous médical, maladie, problème familial..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="min-h-[100px]"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="file">Document justificatif (optionnel)</Label>
            <div className="space-y-2">
              {!file ? (
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
                  <Upload className="mx-auto h-8 w-8 text-gray-400 mb-2" />
                  <Label 
                    htmlFor="file" 
                    className="cursor-pointer text-sm text-blue-600 hover:text-blue-500"
                  >
                    Cliquez pour sélectionner un fichier
                  </Label>
                  <Input
                    id="file"
                    type="file"
                    accept=".pdf,.jpeg,.jpg,.png"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    PDF, JPEG ou PNG - Max 5MB
                  </p>
                </div>
              ) : (
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Upload className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-medium">{file.name}</span>
                    <span className="text-xs text-gray-500">
                      ({(file.size / 1024 / 1024).toFixed(2)} MB)
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={removeFile}
                    className="h-8 w-8 p-0"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Annuler
            </Button>
            <Button 
              type="submit" 
              disabled={isSubmitting || !reason.trim()}
            >
              {isSubmitting ? 'Envoi...' : 'Envoyer le justificatif'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};