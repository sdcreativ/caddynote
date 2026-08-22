import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, Calendar, Clock, AlertTriangle, ExternalLink, Upload } from "lucide-react";
import { useStrkAuth } from "@/hooks/useStrkAuth";
import { fetchAssignmentsForStudent, fetchSubmissionsByStudent } from "@/services/strkAssignmentService";
import { StrkAssignment, StrkSubmission } from "@/types/strk";
import { SubmissionDialog } from "@/components/assignments/SubmissionDialog";
import { AssignmentDetailsDialog } from "@/components/assignments/AssignmentDetailsDialog";

const AssignmentsPage = () => {
  const { t } = useTranslation('assignments');
  const { t: tc } = useTranslation('common');
  const { user } = useStrkAuth();
  const [selectedAssignment, setSelectedAssignment] = useState<StrkAssignment | null>(null);
  const [submissionDialogOpen, setSubmissionDialogOpen] = useState(false);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);

  const { data: assignments = [], isLoading: assignmentsLoading } = useQuery({
    queryKey: ['student-assignments', user?.id],
    queryFn: () => user ? fetchAssignmentsForStudent(user.id) : [],
    enabled: !!user?.id,
  });

  const { data: submissions = [] } = useQuery({
    queryKey: ['student-submissions', user?.id],
    queryFn: () => user ? fetchSubmissionsByStudent(user.id) : [],
    enabled: !!user?.id,
  });

  const getAssignmentStatus = (assignment: StrkAssignment) => {
    const submission = submissions.find(s => s.assignment_id === assignment.id);
    const dueDate = new Date(assignment.due_date);
    const now = new Date();
    const isOverdue = now > dueDate;

    if (submission) {
      if (submission.grade) return 'graded';
      return 'submitted';
    }
    if (isOverdue) return 'overdue';
    
    const daysDiff = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysDiff <= 2) return 'urgent';
    
    return 'pending';
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'urgent':
        return <Badge variant="destructive">{t('status.urgent')}</Badge>;
      case 'overdue':
        return <Badge variant="destructive">{t('status.overdue')}</Badge>;
      case 'submitted':
        return <Badge variant="secondary">{t('status.submitted')}</Badge>;
      case 'graded':
        return <Badge className="bg-green-100 text-green-800">{t('status.graded')}</Badge>;
      default:
        return <Badge variant="outline">{t('status.todo')}</Badge>;
    }
  };

  const formatDaysRemaining = (dueDate: string) => {
    const due = new Date(dueDate);
    const now = new Date();
    const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return t('overdueBy', { count: Math.abs(diffDays) });
    if (diffDays === 0) return t('dueToday');
    if (diffDays === 1) return t('dueTomorrow');
    return t('daysLeft', { count: diffDays });
  };

  const handleWorkOnAssignment = (assignment: StrkAssignment) => {
    // Ouvrir dans une nouvelle fenêtre
    const url = `/assignment/${assignment.id}/work`;
    window.open(url, '_blank', 'width=1200,height=800');
  };

  const handleSubmitAssignment = (assignment: StrkAssignment) => {
    setSelectedAssignment(assignment);
    setSubmissionDialogOpen(true);
  };

  const handleViewDetails = (assignment: StrkAssignment) => {
    setSelectedAssignment(assignment);
    setDetailsDialogOpen(true);
  };

  if (assignmentsLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground">{tc('actions.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground">
          {t('subtitle')}
        </p>
      </div>

      <div className="grid gap-6">
        {assignments.map((assignment) => {
          const status = getAssignmentStatus(assignment);
          const submission = submissions.find(s => s.assignment_id === assignment.id);
          const isUrgent = status === 'urgent' || status === 'overdue';

          return (
            <Card key={assignment.id} className={isUrgent ? "border-destructive bg-destructive/5" : ""}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className={`flex items-center gap-2 ${isUrgent ? "text-destructive" : ""}`}>
                      {isUrgent ? <AlertTriangle className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
                      {assignment.title}
                    </CardTitle>
                    <CardDescription className={isUrgent ? "text-destructive/70" : ""}>
                      {assignment.description}
                    </CardDescription>
                  </div>
                  {getStatusBadge(status)}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className={`flex items-center gap-4 text-sm ${isUrgent ? "text-destructive/70" : "text-muted-foreground"}`}>
                  <div className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    {t('dueOn', { date: new Date(assignment.due_date).toLocaleDateString('fr-FR') })}
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    {formatDaysRemaining(assignment.due_date)}
                  </div>
                  {submission?.grade && (
                    <div className="flex items-center gap-1">
                      <span>{t('grade', { grade: submission.grade, max: assignment.max_grade || 20 })}</span>
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  {status === 'pending' || status === 'urgent' || status === 'overdue' ? (
                    <>
                      <Button 
                        size="sm" 
                        onClick={() => handleSubmitAssignment(assignment)}
                        className="flex items-center gap-1"
                      >
                        <Upload className="h-4 w-4" />
                        {t('submit')}
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleWorkOnAssignment(assignment)}
                        className="flex items-center gap-1"
                      >
                        <ExternalLink className="h-4 w-4" />
                        {t('workOn')}
                      </Button>
                    </>
                  ) : status === 'submitted' ? (
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleWorkOnAssignment(assignment)}
                      className="flex items-center gap-1"
                    >
                      <ExternalLink className="h-4 w-4" />
                      {t('viewSubmission')}
                    </Button>
                  ) : (
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleWorkOnAssignment(assignment)}
                      className="flex items-center gap-1"
                    >
                      <ExternalLink className="h-4 w-4" />
                      {t('viewCorrection')}
                    </Button>
                  )}
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => handleViewDetails(assignment)}
                  >
                    {t('viewInstructions')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {assignments.length === 0 && (
          <Card>
            <CardContent className="text-center py-8">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">{t('empty')}</p>
            </CardContent>
          </Card>
        )}
      </div>

      {selectedAssignment && (
        <>
          <SubmissionDialog
            assignment={selectedAssignment}
            open={submissionDialogOpen}
            onOpenChange={setSubmissionDialogOpen}
          />
          <AssignmentDetailsDialog
            assignment={selectedAssignment}
            open={detailsDialogOpen}
            onOpenChange={setDetailsDialogOpen}
          />
        </>
      )}
    </div>
  );
};

export default AssignmentsPage;