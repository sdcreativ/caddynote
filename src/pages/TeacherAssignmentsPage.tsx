import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useStrkAuth } from '@/hooks/useStrkAuth';
import { fetchAssignmentFollowUp, fetchAssignmentsByTeacher } from '@/services/strkAssignmentService';
import { StrkAssignment } from '@/types/strk';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { FileText, Users, Clock, CheckCircle, Search, AlertTriangle } from 'lucide-react';
import { AssignmentFollowUpDialog } from '@/components/assignments/AssignmentFollowUpDialog';

const dueDateOf = (assignment: StrkAssignment & { dueDate?: string }) =>
  assignment.dueDate ?? assignment.due_date;

const TeacherAssignmentsPage = () => {
  const { t } = useTranslation('assignments');
  const { user } = useStrkAuth();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ['teacher-assignments', user?.id],
    queryFn: () => (user ? fetchAssignmentsByTeacher(user.id) : []),
    enabled: !!user?.id,
  });

  const filteredAssignments = assignments.filter(
    (assignment) =>
      assignment.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      assignment.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const openFollowUp = (assignment: StrkAssignment) => {
    setSelectedId(assignment.id);
    setFollowUpOpen(true);
  };

  const activeAssignments = filteredAssignments.filter((a) => a.status === 'active');
  const archivedAssignments = filteredAssignments.filter((a) => a.status === 'archived');

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
        </div>
        <LoadingState label={t('teacher.loading')} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('teacher.title')}</h1>
        <p className="text-muted-foreground">{t('teacher.subtitle')}</p>
      </div>

      <div className="flex items-center space-x-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t('teacher.searchPlaceholder')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-sm"
        />
      </div>

      <Tabs defaultValue="active" className="space-y-4">
        <TabsList>
          <TabsTrigger value="active">{t('teacher.active', { count: activeAssignments.length })}</TabsTrigger>
          <TabsTrigger value="archived">{t('teacher.archived', { count: archivedAssignments.length })}</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-4">
          <AssignmentList assignments={activeAssignments} onFollowUp={openFollowUp} />
        </TabsContent>

        <TabsContent value="archived" className="space-y-4">
          <AssignmentList assignments={archivedAssignments} onFollowUp={openFollowUp} archived />
        </TabsContent>
      </Tabs>

      <AssignmentFollowUpDialog
        assignmentId={selectedId}
        open={followUpOpen}
        onOpenChange={setFollowUpOpen}
      />
    </div>
  );
};

const AssignmentList = ({
  assignments,
  onFollowUp,
  archived = false,
}: {
  assignments: StrkAssignment[];
  onFollowUp: (assignment: StrkAssignment) => void;
  archived?: boolean;
}) => {
  const { t } = useTranslation('assignments');
  if (assignments.length === 0) {
    return (
      <Card>
        <CardContent>
          <EmptyState
            title={archived ? t('teacher.emptyArchivedTitle') : t('teacher.emptyActiveTitle')}
            description={archived ? t('teacher.emptyArchivedBody') : t('teacher.emptyActiveBody')}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4">
      {assignments.map((assignment) => (
        <AssignmentCard key={assignment.id} assignment={assignment} onFollowUp={() => onFollowUp(assignment)} archived={archived} />
      ))}
    </div>
  );
};

const AssignmentCard = ({
  assignment,
  onFollowUp,
  archived = false,
}: {
  assignment: StrkAssignment;
  onFollowUp: () => void;
  archived?: boolean;
}) => {
  const { t } = useTranslation('assignments');
  const { data: followUp } = useQuery({
    queryKey: ['assignment-follow-up', assignment.id],
    queryFn: () => fetchAssignmentFollowUp(assignment.id),
  });

  const dueDate = dueDateOf(assignment as StrkAssignment & { dueDate?: string });
  const isOverdue = dueDate ? new Date() > new Date(dueDate) : false;
  const summary = followUp?.summary;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {assignment.title}
            </CardTitle>
            <CardDescription>
              {followUp?.course?.className ? `${followUp.course.className} · ` : ''}
              {assignment.description}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {isOverdue && !archived && <Badge variant="destructive">{t('teacher.overdue')}</Badge>}
            <Badge variant="outline">
              {(assignment as StrkAssignment & { assignmentType?: string }).assignmentType ||
                assignment.assignment_type ||
                t('teacher.typeFallback')}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span>
              {summary ? t('teacher.submitted', { submitted: summary.submitted, roster: summary.roster }) : '…'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-orange-600" />
            <span>{summary ? t('teacher.late', { count: summary.late }) : '…'}</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span>{summary ? t('teacher.notSubmitted', { count: summary.missing + summary.pending }) : '…'}</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <span>{summary ? t('teacher.graded', { count: summary.graded }) : '…'}</span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {dueDate ? t('teacher.due', { date: new Date(dueDate).toLocaleDateString('fr-FR') }) : t('teacher.noDue')}
          </div>
          <Button size="sm" onClick={onFollowUp}>
            {summary ? t('teacher.followUpWithCount', { count: summary.toGrade }) : t('teacher.followUp')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default TeacherAssignmentsPage;
