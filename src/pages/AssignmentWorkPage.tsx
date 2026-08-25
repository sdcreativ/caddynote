import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useStrkAuth } from "@/hooks/useStrkAuth";
import { 
  fetchAssignmentById, 
  fetchSubmissionsByStudent, 
  createSubmission, 
  updateSubmission 
} from "@/services/strkAssignmentService";
import { StrkAssignment, StrkSubmission } from "@/types/strk";
import { 
  Save, 
  Send, 
  Clock, 
  FileText, 
  Upload, 
  X, 
  AlertTriangle,
  CheckCircle 
} from "lucide-react";

const AssignmentWorkPage = () => {
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const { t } = useTranslation('assignments');
  const { t: tc } = useTranslation('common');
  const { user } = useStrkAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [content, setContent] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [assignment, setAssignment] = useState<StrkAssignment | null>(null);
  const [submission, setSubmission] = useState<StrkSubmission | null>(null);

  // Charger l'assignment
  const { data: assignmentData } = useQuery({
    queryKey: ['assignment', assignmentId],
    queryFn: () => assignmentId ? fetchAssignmentById(assignmentId) : null,
    enabled: !!assignmentId,
  });

  // Charger les soumissions de l'étudiant pour trouver celle de ce devoir
  const { data: submissions = [] } = useQuery({
    queryKey: ['student-submissions', user?.id],
    queryFn: () => user ? fetchSubmissionsByStudent(user.id) : [],
    enabled: !!user?.id,
  });

  // Mettre à jour l'assignment quand les données arrivent
  useEffect(() => {
    if (assignmentData) {
      setAssignment(assignmentData);
    }
  }, [assignmentData]);

  // Auto-save toutes les 30 secondes
  useEffect(() => {
    if (!content.trim() && files.length === 0) return;
    
    const interval = setInterval(() => {
      handleAutoSave();
    }, 30000);

    return () => clearInterval(interval);
  }, [content, files]);

  // Charger les données existantes
  useEffect(() => {
    if (submissions.length > 0 && assignmentId) {
      const existingSubmission = submissions.find(s => s.assignment_id === assignmentId);
      if (existingSubmission) {
        setSubmission(existingSubmission);
        setContent(existingSubmission.content || "");
        // Charger les fichiers si nécessaire
      }
    }
  }, [submissions, assignmentId]);

  const saveMutation = useMutation({
    mutationFn: async (isSubmit: boolean = false) => {
      if (!user || !assignmentId) throw new Error("Données manquantes");
      
      const attachments = [];
      for (const file of files) {
        const { uploadViaPresignedPost } = await import('@/lib/s3Upload');
        const key = await uploadViaPresignedPost('devoirs', file);
        attachments.push({
          name: file.name,
          size: file.size,
          type: file.type,
          key,
        });
      }

      const submissionData = {
        assignment_id: assignmentId,
        student_id: user.id,
        content,
        attachments,
        status: isSubmit ? 'submitted' : 'draft'
      };

      if (submission) {
        return updateSubmission(submission.id, submissionData);
      } else {
        return createSubmission(submissionData);
      }
    },
    onSuccess: (data, isSubmit) => {
      setSubmission(data);
      setLastSaved(new Date());
      queryClient.invalidateQueries({ queryKey: ['student-submissions'] });
      
      if (isSubmit) {
        toast({
          title: t('work.submittedTitle'),
          description: t('work.submittedBody')
        });
        // Fermer la fenêtre après soumission
        setTimeout(() => window.close(), 2000);
      } else {
        toast({
          title: t('work.draftTitle'),
          description: t('work.draftBody')
        });
      }
    },
    onError: (error) => {
      console.error("Erreur lors de la sauvegarde:", error);
      toast({
        title: t('work.saveErrorTitle'),
        description: t('work.saveErrorBody'),
        variant: "destructive"
      });
    }
  });

  const handleAutoSave = () => {
    if (content.trim() || files.length > 0) {
      saveMutation.mutate(false);
    }
  };

  const handleManualSave = () => {
    saveMutation.mutate(false);
  };

  const handleSubmit = () => {
    if (!content.trim() && files.length === 0) {
      toast({
        title: tc('status.error'),
        description: t('work.emptySubmit'),
        variant: "destructive"
      });
      return;
    }
    saveMutation.mutate(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(prev => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const formatTimeRemaining = () => {
    if (!assignment) return "";
    
    const now = new Date();
    const dueDate = new Date(assignment.due_date);
    const diff = dueDate.getTime() - now.getTime();
    
    if (diff < 0) return t('work.timeUp');
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (days > 0) return t('work.remainingDays', { days, hours });
    if (hours > 0) return t('work.remainingHours', { hours, minutes });
    return t('work.remainingMinutes', { minutes });
  };

  const isSubmitted = submission?.status === 'submitted';
  const isGraded = submission?.grade !== null && submission?.grade !== undefined;

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* En-tête */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  {assignment?.title || tc('actions.loading')}
                </CardTitle>
                <CardDescription>
                  {assignment?.description}
                </CardDescription>
              </div>
              <div className="flex items-center gap-4">
                {isSubmitted ? (
                  isGraded ? (
                    <Badge className="bg-green-100 text-green-800">
                      <CheckCircle className="h-4 w-4 mr-1" />
                      {t('work.gradedBadge', { grade: submission?.grade, max: assignment?.max_grade || 20 })}
                    </Badge>
                  ) : (
                    <Badge variant="secondary">
                      <Send className="h-4 w-4 mr-1" />
                      {t('status.submitted')}
                    </Badge>
                  )
                ) : (
                  <Badge variant="outline">
                    <Clock className="h-4 w-4 mr-1" />
                    {formatTimeRemaining()}
                  </Badge>
                )}
              </div>
            </div>
            
            {lastSaved && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Save className="h-4 w-4" />
                {t('work.lastSaved', { time: lastSaved.toLocaleTimeString('fr-FR') })}
              </div>
            )}
          </CardHeader>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Zone de travail principale */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{t('work.yourAnswer')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={t('work.placeholder')}
                  rows={20}
                  className="min-h-[500px] resize-none"
                  disabled={isSubmitted}
                />
                
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">
                    {t('work.chars', { count: content.length })}
                  </span>
                  {!isSubmitted && (
                    <Button onClick={handleManualSave} variant="outline" size="sm">
                      <Save className="h-4 w-4 mr-1" />
                      {t('work.save')}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Fichiers joints */}
            <Card>
              <CardHeader>
                <CardTitle>{t('work.attachments')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {!isSubmitted && (
                  <div>
                    <Label htmlFor="files">{t('work.addFiles')}</Label>
                    <Input
                      id="files"
                      type="file"
                      multiple
                      onChange={handleFileChange}
                      className="mt-1"
                    />
                  </div>
                )}

                {files.length > 0 && (
                  <div className="space-y-2">
                    {files.map((file, index) => (
                      <div key={index} className="flex items-center justify-between bg-muted p-3 rounded">
                        <div className="flex items-center gap-2">
                          <Upload className="h-4 w-4" />
                          <span className="text-sm">{file.name}</span>
                          <span className="text-xs text-muted-foreground">
                            ({(file.size / 1024 / 1024).toFixed(2)} MB)
                          </span>
                        </div>
                        {!isSubmitted && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeFile(index)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Panneau latéral */}
          <div className="space-y-6">
            {/* Actions */}
            {!isSubmitted && (
              <Card>
                <CardHeader>
                  <CardTitle>{t('work.actions')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button 
                    onClick={handleSubmit} 
                    className="w-full"
                    disabled={saveMutation.isPending}
                  >
                    <Send className="h-4 w-4 mr-2" />
                    {t('submit')}
                  </Button>
                  <Button 
                    onClick={handleManualSave} 
                    variant="outline" 
                    className="w-full"
                    disabled={saveMutation.isPending}
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {t('work.saveDraft')}
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Consignes */}
            {assignment?.instructions && (
              <Card>
                <CardHeader>
                  <CardTitle>{t('work.instructions')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">
                    {assignment.instructions}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Correction (si disponible) */}
            {isGraded && submission?.feedback && (
              <Card>
                <CardHeader>
                  <CardTitle>{t('work.correction')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{t('work.gradeLabel')}</span>
                      <Badge className="bg-green-100 text-green-800">
                        {submission.grade}/{assignment?.max_grade || 20}
                      </Badge>
                    </div>
                    <Separator />
                    <div>
                      <p className="text-sm font-medium mb-2">{t('work.comments')}</p>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {submission.feedback}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AssignmentWorkPage;