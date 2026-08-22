import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { fetchSubmissionsByAssignment, gradeSubmission } from "@/services/strkAssignmentService";
import { StrkAssignment, StrkSubmission } from "@/types/strk";
import { User, Calendar, FileText, Star } from "lucide-react";

interface AssignmentCorrectionDialogProps {
  assignment: StrkAssignment;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const AssignmentCorrectionDialog = ({ assignment, open, onOpenChange }: AssignmentCorrectionDialogProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedSubmission, setSelectedSubmission] = useState<StrkSubmission | null>(null);
  const [grade, setGrade] = useState("");
  const [feedback, setFeedback] = useState("");

  const { data: submissions = [], isLoading } = useQuery({
    queryKey: ['assignment-submissions', assignment.id],
    queryFn: () => fetchSubmissionsByAssignment(assignment.id),
    enabled: open,
  });

  const gradeMutation = useMutation({
    mutationFn: async ({ submissionId, grade, feedback }: { submissionId: string; grade: number; feedback: string }) => {
      return gradeSubmission(submissionId, grade, feedback);
    },
    onSuccess: () => {
      toast({
        title: "Note attribuée",
        description: "La note a été enregistrée avec succès"
      });
      queryClient.invalidateQueries({ queryKey: ['assignment-submissions'] });
      setSelectedSubmission(null);
      setGrade("");
      setFeedback("");
    },
    onError: (error) => {
      toast({
        title: "Erreur",
        description: "Impossible d'enregistrer la note",
        variant: "destructive"
      });
      console.error("Erreur lors de la notation:", error);
    }
  });

  const handleGradeSubmission = () => {
    if (!selectedSubmission) return;
    
    const gradeValue = parseFloat(grade);
    const maxGrade = assignment.max_grade || 20;
    
    if (isNaN(gradeValue) || gradeValue < 0 || gradeValue > maxGrade) {
      toast({
        title: "Erreur",
        description: `La note doit être comprise entre 0 et ${maxGrade}`,
        variant: "destructive"
      });
      return;
    }

    gradeMutation.mutate({
      submissionId: selectedSubmission.id,
      grade: gradeValue,
      feedback
    });
  };

  const pendingSubmissions = submissions.filter(s => s.grade === null);
  const gradedSubmissions = submissions.filter(s => s.grade !== null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>{assignment.title} - Correction</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[70vh]">
          {/* Liste des soumissions */}
          <div className="space-y-4 overflow-y-auto">
            <div>
              <h3 className="font-medium mb-2">À corriger ({pendingSubmissions.length})</h3>
              <div className="space-y-2">
                {pendingSubmissions.map((submission) => (
                  <SubmissionCard
                    key={submission.id}
                    submission={submission}
                    isSelected={selectedSubmission?.id === submission.id}
                    onClick={() => setSelectedSubmission(submission)}
                    isPending
                  />
                ))}
              </div>
            </div>

            {gradedSubmissions.length > 0 && (
              <div>
                <Separator />
                <h3 className="font-medium mb-2 mt-4">Corrigées ({gradedSubmissions.length})</h3>
                <div className="space-y-2">
                  {gradedSubmissions.map((submission) => (
                    <SubmissionCard
                      key={submission.id}
                      submission={submission}
                      isSelected={selectedSubmission?.id === submission.id}
                      onClick={() => setSelectedSubmission(submission)}
                    />
                  ))}
                </div>
              </div>
            )}

            {submissions.length === 0 && !isLoading && (
              <p className="text-muted-foreground text-center py-8">
                Aucune soumission pour ce devoir
              </p>
            )}
          </div>

          {/* Détail de la soumission */}
          <div className="lg:col-span-2 space-y-4 overflow-y-auto">
            {selectedSubmission ? (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <User className="h-5 w-5" />
                      Soumission - Étudiant {selectedSubmission.student_id.slice(-8)}
                    </CardTitle>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        {selectedSubmission.submitted_at 
                          ? new Date(selectedSubmission.submitted_at).toLocaleDateString('fr-FR')
                          : "Brouillon"}
                      </div>
                      {selectedSubmission.grade !== null && (
                        <div className="flex items-center gap-1">
                          <Star className="h-4 w-4" />
                          Note: {selectedSubmission.grade}/{assignment.max_grade || 20}
                        </div>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div>
                        <Label className="text-sm font-medium">Contenu de la réponse</Label>
                        <div className="mt-2 p-4 bg-muted/50 rounded-lg max-h-64 overflow-y-auto">
                          <p className="text-sm whitespace-pre-wrap">
                            {selectedSubmission.content || "Aucun contenu textuel"}
                          </p>
                        </div>
                      </div>

                      {selectedSubmission.attachments && Array.isArray(selectedSubmission.attachments) && selectedSubmission.attachments.length > 0 && (
                        <div>
                          <Label className="text-sm font-medium">Fichiers joints</Label>
                          <div className="mt-2 space-y-2">
                            {selectedSubmission.attachments.map((attachment: any, index: number) => (
                              <div key={index} className="flex items-center justify-between bg-muted/50 p-3 rounded">
                                <div className="flex items-center gap-2">
                                  <FileText className="h-4 w-4" />
                                  <span className="text-sm">{attachment.name}</span>
                                </div>
                                <Button variant="outline" size="sm">
                                  Télécharger
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Interface de notation */}
                <Card>
                  <CardHeader>
                    <CardTitle>Notation et feedback</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="grade">Note (/ {assignment.max_grade || 20})</Label>
                        <Input
                          id="grade"
                          type="number"
                          min="0"
                          max={assignment.max_grade || 20}
                          step="0.5"
                          value={grade}
                          onChange={(e) => setGrade(e.target.value)}
                          placeholder={selectedSubmission.grade?.toString() || "0"}
                        />
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="feedback">Commentaires et corrections</Label>
                      <Textarea
                        id="feedback"
                        value={feedback}
                        onChange={(e) => setFeedback(e.target.value)}
                        placeholder={selectedSubmission.feedback || "Ajoutez vos commentaires..."}
                        rows={6}
                      />
                    </div>

                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setSelectedSubmission(null)}>
                        Annuler
                      </Button>
                      <Button 
                        onClick={handleGradeSubmission}
                        disabled={gradeMutation.isPending || !grade.trim()}
                      >
                        {gradeMutation.isPending ? "Enregistrement..." : "Enregistrer la note"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-muted-foreground">
                  Sélectionnez une soumission à corriger
                </p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

interface SubmissionCardProps {
  submission: StrkSubmission;
  isSelected: boolean;
  onClick: () => void;
  isPending?: boolean;
}

const SubmissionCard = ({ submission, isSelected, onClick, isPending = false }: SubmissionCardProps) => {
  return (
    <Card 
      className={`cursor-pointer transition-colors ${
        isSelected ? "ring-2 ring-primary" : ""
      } ${isPending ? "border-orange-200" : ""}`}
      onClick={onClick}
    >
      <CardContent className="p-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">
              Étudiant {submission.student_id.slice(-8)}
            </p>
            <p className="text-xs text-muted-foreground">
              {submission.submitted_at 
                ? new Date(submission.submitted_at).toLocaleDateString('fr-FR')
                : "Brouillon"}
            </p>
          </div>
          {submission.grade !== null ? (
            <Badge className="bg-green-100 text-green-800">
              {submission.grade}/20
            </Badge>
          ) : (
            <Badge variant="outline">
              À corriger
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
};