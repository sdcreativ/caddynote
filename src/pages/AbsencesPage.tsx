
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { PlusCircle, Search, Calendar, Download, Check, X, Paperclip } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useStrkAuth } from '@/hooks/useStrkAuth';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useStrkAbsences } from '@/hooks/useStrkAbsences';
import { useQuickActions } from '@/components/quick-actions/QuickActionsManager';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { trackProductEvent } from '@/lib/productTelemetry';
import { PresenceHubTabs } from '@/components/attendance/PresenceHubTabs';
import { Navigate, useNavigate } from 'react-router-dom';
import { hasAnyRole, ATTENDANCE_HUB_ROLES, INSTITUTION_STAFF_ROLES } from '@/lib/roles';
import { openAbsenceJustificationFile, type StrkAbsence } from '@/services/strkAbsenceService';

const AbsencesPage = () => {
  const { t } = useTranslation('absences');
  const { t: tc } = useTranslation('common');
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedAbsence, setSelectedAbsence] = useState<StrkAbsence | null>(null);
  const { toast } = useToast();
  const { user } = useStrkAuth();
  const {
    absences,
    isLoading,
    loadAbsencesByInstitution,
    reviewJustification,
  } = useStrkAbsences();
  const { openAbsenceDialog } = useQuickActions();

  useEffect(() => {
    trackProductEvent('absences', 'Ouverture absences');
  }, []);

  useEffect(() => {
    if (!user) return;
    if (user.role === 'student') return;
    if (user.institutionId && hasAnyRole(user.role, INSTITUTION_STAFF_ROLES)) {
      void loadAbsencesByInstitution(user.institutionId);
    }
  }, [user, loadAbsencesByInstitution]);

  const getInitials = (name: string): string => {
    return name
      .split(' ')
      .map(part => part.charAt(0))
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

  const getTypeLabel = (type: string) => {
    return type === 'absence' ? t('types.absence') : t('types.lateness');
  };

  const getTypeColor = (type: string) => {
    return type === 'absence' ? 'destructive' : 'secondary';
  };

  // PRS-005 : `justification_status` distingue "jamais soumis" de "rejeté"
  // (l'ancien `justified` seul valait `false` dans les deux cas).
  const getJustificationBadge = (status: string) => {
    switch (status) {
      case 'accepted':
        return { variant: 'secondary' as const, label: t('status.justified') };
      case 'pending':
        return { variant: 'outline' as const, label: t('status.pendingValidation') };
      case 'rejected':
        return { variant: 'destructive' as const, label: t('status.rejected') };
      default:
        return { variant: 'destructive' as const, label: t('status.unjustified') };
    }
  };

  const handleReview = async (absenceId: string, justified: boolean) => {
    const updated = await reviewJustification(absenceId, justified);
    if (updated) {
      toast({
        title: justified ? t('page.acceptedTitle') : t('page.rejectedTitle'),
        description: justified
          ? t('page.acceptedBody')
          : t('page.rejectedBody'),
      });
      setSelectedAbsence(null);
    } else {
      toast({
        title: tc('status.error'),
        description: t('page.reviewError'),
        variant: 'destructive',
      });
    }
  };

  const openJustificationFile = async (absenceId: string) => {
    try {
      await openAbsenceJustificationFile(absenceId);
    } catch {
      toast({
        title: tc('status.error'),
        description: t('page.reviewError'),
        variant: 'destructive',
      });
    }
  };

  const formatDuration = (duration: number) => {
    if (duration >= 60) {
      const hours = Math.floor(duration / 60);
      const minutes = duration % 60;
      return minutes > 0
        ? t('page.durationHoursMinutes', { hours, minutes })
        : t('page.durationHours', { hours });
    }
    return t('page.durationMinutes', { duration });
  };

  const filteredAbsences = absences.filter(absence => {
    const studentLabel = [absence.student?.first_name, absence.student?.last_name, absence.student_id]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    const matchesSearch =
      searchTerm === '' ||
      studentLabel.includes(searchTerm.toLowerCase()) ||
      (absence.justification_reason &&
        absence.justification_reason.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesType = filterType === 'all' || absence.type === filterType;
    const matchesStatus = filterStatus === 'all' || 
      (filterStatus === 'justified' && absence.justified) ||
      (filterStatus === 'unjustified' && !absence.justified);
    
    return matchesSearch && matchesType && matchesStatus;
  });

  const pageTitle =
    user?.role === 'student' ? t('page.titleStudent') :
    user?.role === 'teacher' ? t('page.titleTeacher') : t('page.titleStaff');
  const pageSubtitle =
    user?.role === 'student' ? t('page.subtitleStudent') : t('page.subtitleStaff');


  if (user?.role === 'student') {
    return <Navigate to="/my-absences" replace />;
  }
  return (
    <div className="space-y-6 py-6 animate-fade-in">
      <PresenceHubTabs />
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0">
        <div>
          <h1 className="text-3xl font-bold">
            {pageTitle}
          </h1>
          <p className="text-gray-500 mt-1">
            {pageSubtitle}
          </p>
        </div>
        
        <div className="flex gap-2">
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            {tc('actions.export')}
          </Button>
          {user?.role !== 'student' && (
            <Button onClick={openAbsenceDialog}>
              <PlusCircle className="mr-2 h-5 w-5" />
              {t('page.newAbsence')}
            </Button>
          )}
        </div>
      </div>

      {/* Statistiques rapides */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="rounded-full bg-red-100 p-3">
                <Calendar className="h-6 w-6 text-red-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">{t('page.totalAbsences')}</p>
                <p className="text-2xl font-bold text-gray-900">{absences.filter(a => a.type === 'absence').length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="rounded-full bg-yellow-100 p-3">
                <Calendar className="h-6 w-6 text-yellow-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">{t('page.totalLateness')}</p>
                <p className="text-2xl font-bold text-gray-900">{absences.filter(a => a.type === 'lateness').length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="rounded-full bg-green-100 p-3">
                <Calendar className="h-6 w-6 text-green-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">{t('page.justified')}</p>
                <p className="text-2xl font-bold text-gray-900">{absences.filter(a => a.justified).length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="rounded-full bg-gray-100 p-3">
                <Calendar className="h-6 w-6 text-gray-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">{t('page.unjustified')}</p>
                <p className="text-2xl font-bold text-gray-900">{absences.filter(a => !a.justified).length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="bg-white shadow-sm rounded-lg p-6">
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-center mb-6">
          <div className="relative w-full sm:max-w-xs">
            <Input
              type="text"
              placeholder={t('page.searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
            <Search className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
          </div>

          <div className="flex gap-2">
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder={t('page.typePlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('page.filterAll')}</SelectItem>
                <SelectItem value="absence">{t('page.filterAbsences')}</SelectItem>
                <SelectItem value="lateness">{t('page.filterLateness')}</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder={t('page.statusPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('page.filterAll')}</SelectItem>
                <SelectItem value="justified">{t('page.filterJustified')}</SelectItem>
                <SelectItem value="unjustified">{t('page.filterUnjustified')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        
        {isLoading ? (
          <LoadingState label={t('page.loading')} />
        ) : filteredAbsences.length === 0 ? (
          <EmptyState
            title={t('page.emptyTitle')}
            description={t('page.emptyBody')}
            actionLabel={
              hasAnyRole(user?.role, ATTENDANCE_HUB_ROLES) ||
              user?.role === 'teacher' ||
              user?.role === 'head_teacher'
                ? t('page.emptyActionCall')
                : undefined
            }
            onAction={
              hasAnyRole(user?.role, ATTENDANCE_HUB_ROLES)
                ? () => navigate('/attendance')
                : user?.role === 'teacher' || user?.role === 'head_teacher'
                  ? () => navigate('/teacher-attendance')
                  : undefined
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {user?.role !== 'student' && <TableHead>{t('page.colStudent')}</TableHead>}
                <TableHead>{t('page.colDate')}</TableHead>
                <TableHead>{t('page.colType')}</TableHead>
                <TableHead>{t('page.colDuration')}</TableHead>
                <TableHead>{t('page.colCourse')}</TableHead>
                <TableHead>{t('page.colStatus')}</TableHead>
                <TableHead>{t('page.colReason')}</TableHead>
                <TableHead className="text-right">{t('page.colActions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAbsences.map((absence) => (
                <TableRow key={absence.id}>
                  {user?.role !== 'student' && (
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs">
                            {getInitials(
                              [absence.student?.first_name, absence.student?.last_name]
                                .filter(Boolean)
                                .join(' ') || t('page.initialsFallback')
                            )}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium text-sm">
                            {[absence.student?.first_name, absence.student?.last_name]
                              .filter(Boolean)
                              .join(' ') || t('page.unknown')}
                          </div>
                          {absence.student?.email ? (
                            <div className="text-xs text-gray-500">{absence.student.email}</div>
                          ) : null}
                        </div>
                      </div>
                    </TableCell>
                  )}
                  <TableCell>
                    <div className="text-sm">
                      {new Date(absence.date).toLocaleDateString('fr-FR')}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={getTypeColor(absence.type)}>
                      {getTypeLabel(absence.type)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm font-medium">
                      {formatDuration(absence.duration_minutes)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{absence.course_name || absence.class_name || t('page.unspecified')}</div>
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const badge = getJustificationBadge(absence.justification_status);
                      return <Badge variant={badge.variant}>{badge.label}</Badge>;
                    })()}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm text-gray-500 max-w-xs truncate">
                      {absence.justification_reason || t('page.reasonEmpty')}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {absence.justification_file ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openJustificationFile(absence.id)}
                          aria-label={t('mine.viewDocument', { defaultValue: 'Voir le justificatif' })}
                        >
                          <Paperclip className="h-4 w-4" />
                        </Button>
                      ) : null}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedAbsence(absence)}
                      >
                        {t('page.details')}
                      </Button>
                      {user?.role !== 'student' && absence.justification_status === 'pending' && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleReview(absence.id, true)}
                            aria-label={t('page.acceptAria')}
                          >
                            <Check className="h-4 w-4 text-green-600" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleReview(absence.id, false)}
                            aria-label={t('page.rejectAria')}
                          >
                            <X className="h-4 w-4 text-destructive" />
                          </Button>
                        </>
                      )}
                      {user?.role !== 'student' && absence.justification_status === 'none' && (
                        <Button variant="ghost" size="sm" onClick={() => handleReview(absence.id, true)}>
                          {t('page.justify')}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog
        open={!!selectedAbsence}
        onOpenChange={(open) => {
          if (!open) setSelectedAbsence(null);
        }}
      >
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{t('page.detailsTitle')}</DialogTitle>
          </DialogHeader>

          {selectedAbsence && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-4">
                {user?.role !== 'student' && (
                  <div>
                    <p className="text-sm font-medium text-gray-500">{t('page.colStudent')}</p>
                    <p className="font-medium">
                      {[selectedAbsence.student?.first_name, selectedAbsence.student?.last_name]
                        .filter(Boolean)
                        .join(' ') || t('page.unknown')}
                    </p>
                    {selectedAbsence.student?.email ? (
                      <p className="text-xs text-gray-500 mt-0.5">{selectedAbsence.student.email}</p>
                    ) : null}
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium text-gray-500">{t('page.colDate')}</p>
                  <p className="font-medium">
                    {new Date(selectedAbsence.date).toLocaleDateString('fr-FR')}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">{t('page.colType')}</p>
                  <Badge variant={getTypeColor(selectedAbsence.type)} className="mt-1">
                    {getTypeLabel(selectedAbsence.type)}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">{t('page.colDuration')}</p>
                  <p className="font-medium">{formatDuration(selectedAbsence.duration_minutes)}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">{t('page.colCourse')}</p>
                  <p className="font-medium">
                    {selectedAbsence.course_name || selectedAbsence.class_name || t('page.unspecified')}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">{t('page.colStatus')}</p>
                  {(() => {
                    const badge = getJustificationBadge(selectedAbsence.justification_status);
                    return (
                      <Badge variant={badge.variant} className="mt-1">
                        {badge.label}
                      </Badge>
                    );
                  })()}
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-500">{t('page.colReason')}</p>
                <p className="mt-1">
                  {selectedAbsence.justification_reason || t('page.reasonEmpty')}
                </p>
              </div>

              {selectedAbsence.start_time || selectedAbsence.end_time ? (
                <div>
                  <p className="text-sm font-medium text-gray-500">{t('page.timeRange')}</p>
                  <p className="mt-1">
                    {t('mine.timeRange', {
                      start: selectedAbsence.start_time || '—',
                      end: selectedAbsence.end_time || '—',
                    })}
                  </p>
                </div>
              ) : null}

              <DialogFooter className="flex-wrap gap-2 sm:justify-end">
                {selectedAbsence.justification_file ? (
                  <Button
                    variant="outline"
                    onClick={() => void openJustificationFile(selectedAbsence.id)}
                  >
                    <Paperclip className="mr-2 h-4 w-4" />
                    {t('mine.viewDocument')}
                  </Button>
                ) : null}
                {user?.role !== 'student' && selectedAbsence.justification_status === 'pending' && (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => void handleReview(selectedAbsence.id, true)}
                    >
                      <Check className="mr-2 h-4 w-4 text-green-600" />
                      {t('page.accept')}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => void handleReview(selectedAbsence.id, false)}
                    >
                      <X className="mr-2 h-4 w-4 text-destructive" />
                      {t('page.reject')}
                    </Button>
                  </>
                )}
                {user?.role !== 'student' && selectedAbsence.justification_status === 'none' && (
                  <Button onClick={() => void handleReview(selectedAbsence.id, true)}>
                    {t('page.justify')}
                  </Button>
                )}
                <Button variant="outline" onClick={() => setSelectedAbsence(null)}>
                  {tc('actions.close')}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AbsencesPage;
