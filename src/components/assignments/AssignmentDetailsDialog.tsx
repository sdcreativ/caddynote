import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { StrkAssignment } from "@/types/strk";
import { Calendar, Clock, User, BookOpen } from "lucide-react";

interface AssignmentDetailsDialogProps {
  assignment: StrkAssignment;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const AssignmentDetailsDialog = ({ assignment, open, onOpenChange }: AssignmentDetailsDialogProps) => {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-FR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getAssignmentTypeBadge = (type: string) => {
    const typeLabels: Record<string, string> = {
      homework: "Devoir",
      project: "Projet",
      essay: "Dissertation",
      quiz: "Quiz"
    };
    
    return (
      <Badge variant="outline">
        {typeLabels[type] || type}
      </Badge>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>{assignment.title}</DialogTitle>
            {getAssignmentTypeBadge(assignment.assignment_type)}
          </div>
          <DialogDescription>
            Détails et consignes du devoir
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Informations générales */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Date limite :</span>
              <span className="font-medium">{formatDate(assignment.due_date)}</span>
            </div>
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Note maximale :</span>
              <span className="font-medium">{assignment.max_grade || 20} points</span>
            </div>
          </div>

          <Separator />

          {/* Description */}
          {assignment.description && (
            <div>
              <h3 className="font-medium mb-2">Description</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {assignment.description}
              </p>
            </div>
          )}

          {/* Instructions */}
          {assignment.instructions && (
            <div>
              <h3 className="font-medium mb-2">Consignes</h3>
              <div className="bg-muted/50 p-4 rounded-lg">
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {assignment.instructions}
                </p>
              </div>
            </div>
          )}

          {/* Pièces jointes */}
          {assignment.attachments && Array.isArray(assignment.attachments) && assignment.attachments.length > 0 && (
            <div>
              <h3 className="font-medium mb-2">Documents fournis</h3>
              <div className="space-y-2">
                {assignment.attachments.map((attachment: any, index: number) => (
                  <div key={index} className="flex items-center justify-between bg-muted/50 p-3 rounded">
                    <div className="flex items-center gap-2">
                      <BookOpen className="h-4 w-4" />
                      <span className="text-sm">{attachment.name || `Document ${index + 1}`}</span>
                    </div>
                    <Button variant="outline" size="sm">
                      Télécharger
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Statut */}
          <div className="bg-primary/5 p-4 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4 text-primary" />
              <span className="font-medium text-primary">Statut</span>
            </div>
            <p className="text-sm text-muted-foreground">
              {assignment.status === 'active' ? 
                "Ce devoir est actuellement ouvert aux soumissions." :
                "Ce devoir n'est plus ouvert aux soumissions."
              }
            </p>
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={() => onOpenChange(false)}>
            Fermer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};