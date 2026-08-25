import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useStrkAuth } from "@/hooks/useStrkAuth";
import { createSubmission } from "@/services/strkAssignmentService";
import { StrkAssignment } from "@/types/strk";
import { Upload, X } from "lucide-react";
import { uploadViaPresignedPost } from "@/lib/s3Upload";

interface SubmissionDialogProps {
  assignment: StrkAssignment;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const SubmissionDialog = ({ assignment, open, onOpenChange }: SubmissionDialogProps) => {
  const { user } = useStrkAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [content, setContent] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Utilisateur non connecté");

      const attachments = [];
      for (const file of files) {
        const key = await uploadViaPresignedPost('devoirs', file);
        attachments.push({
          name: file.name,
          size: file.size,
          type: file.type,
          key,
        });
      }

      return createSubmission({
        assignmentId: assignment.id,
        studentId: user.id,
        content,
        attachments,
        status: 'submitted',
      } as any);
    },
    onSuccess: () => {
      toast({
        title: "Devoir soumis",
        description: "Votre devoir a été soumis avec succès"
      });
      queryClient.invalidateQueries({ queryKey: ['student-submissions'] });
      onOpenChange(false);
      setContent("");
      setFiles([]);
    },
    onError: (error) => {
      toast({
        title: "Erreur",
        description: "Impossible de soumettre le devoir",
        variant: "destructive"
      });
      console.error("Erreur lors de la soumission:", error);
    }
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(prev => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() && files.length === 0) {
      toast({
        title: "Erreur",
        description: "Veuillez ajouter du contenu ou des fichiers",
        variant: "destructive"
      });
      return;
    }
    submitMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Soumettre le devoir</DialogTitle>
          <DialogDescription>
            {assignment.title}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="content">Votre réponse</Label>
            <Textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Écrivez votre réponse ici..."
              rows={8}
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="files">Fichiers joints (optionnel)</Label>
            <Input
              id="files"
              type="file"
              multiple
              onChange={handleFileChange}
              className="mt-1"
            />
          </div>

          {files.length > 0 && (
            <div className="space-y-2">
              <Label>Fichiers sélectionnés :</Label>
              {files.map((file, index) => (
                <div key={index} className="flex items-center justify-between bg-muted p-2 rounded">
                  <div className="flex items-center gap-2">
                    <Upload className="h-4 w-4" />
                    <span className="text-sm">{file.name}</span>
                    <span className="text-xs text-muted-foreground">
                      ({(file.size / 1024 / 1024).toFixed(2)} MB)
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeFile(index)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={submitMutation.isPending}>
              {submitMutation.isPending ? "Soumission..." : "Soumettre"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};