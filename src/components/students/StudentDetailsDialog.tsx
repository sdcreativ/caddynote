import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StudentHealthForm } from '@/components/students/StudentHealthForm';
import { useToast } from '@/hooks/use-toast';
import { useStrkUsers } from '@/hooks/useStrkUsers';
import { useStrkClasses } from '@/hooks/useStrkClasses';
import { useStrkAuth } from '@/hooks/useStrkAuth';
import { GuardianManagement } from '@/components/students/GuardianManagement';
import { User, Mail, Phone, Calendar, MapPin, GraduationCap, BarChart3, AlertCircle } from 'lucide-react';
import { apiClient } from '@/lib/apiClient';
import { SELECT_NONE } from '@/lib/selectNone';

interface EnrollmentRow {
  id: string;
  academicYear: string;
  isActive: boolean;
  outcome: string | null;
  endedAt: string | null;
  class: { id: string; name: string; academicYear: string | null } | null;
}

interface StudentDetailsDialogProps {
  student: {
    id: string;
    name: string;
    email: string;
    phone?: string;
    dateOfBirth?: string;
    address?: string;
    status: 'active' | 'inactive' | 'suspended';
    attendanceRate?: number;
    class?: string;
    institutionId?: string;
  } | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (studentData: any) => void;
  classes: any[];
  isEditing?: boolean;
}

export const StudentDetailsDialog: React.FC<StudentDetailsDialogProps> = ({
  student,
  isOpen,
  onClose,
  onSave,
  classes,
  isEditing = false
}) => {
  const { t } = useTranslation('students');
  const { t: tc } = useTranslation('common');
  const { user: currentUser } = useStrkAuth();
  const [editMode, setEditMode] = useState(isEditing);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    dateOfBirth: '',
    address: '',
    status: 'active' as 'active' | 'inactive' | 'suspended',
    classId: SELECT_NONE
  });

  useEffect(() => {
    if (student) {
      const [firstName, ...lastNameParts] = (student.name || '').split(' ');
      setFormData({
        firstName: firstName || '',
        lastName: lastNameParts.join(' ') || '',
        email: student.email || '',
        phone: student.phone || '',
        dateOfBirth: student.dateOfBirth || '',
        address: student.address || '',
        status: student.status || 'active',
        classId: SELECT_NONE,
      });
      apiClient
        .get<{ enrollments: EnrollmentRow[] }>(`/students/${student.id}/enrollments`)
        .then(({ enrollments: rows }) => {
          setEnrollments(rows);
          const active = rows.find((r) => r.isActive && r.class?.id);
          if (active?.class?.id) {
            setFormData((prev) => ({ ...prev, classId: active.class!.id }));
          }
        })
        .catch(() => setEnrollments([]));
    }
  }, [student]);

  const { toast } = useToast();
  const [enrollments, setEnrollments] = useState<EnrollmentRow[]>([]);

  const handleSave = () => {
    if (!formData.firstName || !formData.lastName || !formData.email) {
      toast({
        title: tc('status.error'),
        description: t('create.required'),
        variant: "destructive",
      });
      return;
    }

    onSave({
      ...formData,
      name: `${formData.firstName} ${formData.lastName}`.trim()
    });
    setEditMode(false);
  };

  const handleStatusChange = (newStatus: 'active' | 'inactive' | 'suspended') => {
    setFormData(prev => ({ ...prev, status: newStatus }));
    
    if (student && !editMode) {
      onSave({
        ...formData,
        status: newStatus,
        name: `${formData.firstName} ${formData.lastName}`.trim()
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'inactive': return 'bg-gray-100 text-gray-800';
      case 'suspended': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'active': return t('statusActive');
      case 'inactive': return t('statusInactive');
      case 'suspended': return t('statusSuspended');
      default: return t('details.statusUnknown');
    }
  };

  if (!student) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              {editMode ? t('details.editTitle') : t('details.viewTitle')}
            </DialogTitle>
            <Badge className={getStatusColor(formData.status)}>
              {getStatusText(formData.status)}
            </Badge>
          </div>
        </DialogHeader>

        <Tabs defaultValue="details" className="w-full">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="details">{t('details.tabDetails')}</TabsTrigger>
            <TabsTrigger value="academic">{t('details.tabAcademic')}</TabsTrigger>
            <TabsTrigger value="history">{t('details.tabHistory')}</TabsTrigger>
            <TabsTrigger value="guardians">{t('details.tabGuardians')}</TabsTrigger>
            <TabsTrigger value="health">{t('details.tabHealth')}</TabsTrigger>
            <TabsTrigger value="stats">{t('details.tabStats')}</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">{t('create.firstName')}</Label>
                <Input
                  id="firstName"
                  value={formData.firstName}
                  onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                  disabled={!editMode}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">{t('create.lastName')}</Label>
                <Input
                  id="lastName"
                  value={formData.lastName}
                  onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                  disabled={!editMode}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">{t('create.email')}</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                disabled={!editMode}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">{t('create.phone')}</Label>
              <Input
                id="phone"
                value={formData.phone}
                onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                disabled={!editMode}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dateOfBirth">{t('details.dateOfBirth')}</Label>
              <Input
                id="dateOfBirth"
                type="date"
                value={formData.dateOfBirth}
                onChange={(e) => setFormData(prev => ({ ...prev, dateOfBirth: e.target.value }))}
                disabled={!editMode}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">{t('details.address')}</Label>
              <Input
                id="address"
                value={formData.address}
                onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                disabled={!editMode}
              />
            </div>
          </TabsContent>

          <TabsContent value="academic" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="class">{t('create.class')}</Label>
              <Select
                value={formData.classId}
                onValueChange={(value) => setFormData(prev => ({ ...prev, classId: value }))}
                disabled={!editMode}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('details.classPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SELECT_NONE}>{t('create.noClass')}</SelectItem>
                  {classes.map((cls) => (
                    <SelectItem key={cls.id} value={cls.id}>
                      {cls.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t('details.status')}</Label>
              <Select
                value={formData.status}
                onValueChange={handleStatusChange}
                disabled={!editMode}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">{t('statusActive')}</SelectItem>
                  <SelectItem value="inactive">{t('statusInactive')}</SelectItem>
                  <SelectItem value="suspended">{t('statusSuspended')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {!editMode && (
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center space-x-2">
                      <GraduationCap className="h-4 w-4 text-blue-500" />
                      <div>
                        <p className="text-sm font-medium">{t('details.currentClass')}</p>
                        <p className="text-lg font-bold">
                          {formData.classId ? 
                            classes.find(c => c.id === formData.classId)?.name || t('details.classNotFound') : 
                            t('unassigned')
                          }
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center space-x-2">
                      <AlertCircle className="h-4 w-4 text-amber-500" />
                      <div>
                        <p className="text-sm font-medium">{t('details.status')}</p>
                        <p className="text-lg font-bold">{getStatusText(formData.status)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          <TabsContent value="history" className="space-y-3">
            <p className="text-sm text-muted-foreground">{t('details.historyHint')}</p>
            {enrollments.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('details.noHistory')}</p>
            ) : (
              <ul className="space-y-2">
                {enrollments.map((e) => (
                  <li key={e.id} className="rounded-md border p-3 text-sm">
                    <p className="font-medium">
                      {t(e.isActive ? 'details.enrollmentLineActive' : 'details.enrollmentLine', {
                        year: e.academicYear,
                        className: e.class?.name || t('details.unknownClass'),
                      })}
                    </p>
                    {e.outcome && <p className="text-muted-foreground">{t('details.outcome', { outcome: e.outcome })}</p>}
                    {e.endedAt && (
                      <p className="text-muted-foreground">{t('details.endedAt', { date: new Date(e.endedAt).toLocaleDateString('fr-FR') })}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="guardians" className="space-y-4">
            <GuardianManagement
              studentId={student.id}
              institutionId={student.institutionId || currentUser?.institutionId || ''}
            />
          </TabsContent>

          <TabsContent value="health" className="space-y-4">
            <StudentHealthForm studentId={student.id} />
          </TabsContent>

          <TabsContent value="stats" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center space-x-2">
                    <BarChart3 className="h-4 w-4 text-green-500" />
                    <div>
                      <p className="text-sm font-medium">{t('details.attendanceRate')}</p>
                      <p className="text-2xl font-bold">{student.attendanceRate || 95}%</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center space-x-2">
                    <Calendar className="h-4 w-4 text-purple-500" />
                    <div>
                      <p className="text-sm font-medium">{t('details.enrolledSince')}</p>
                      <p className="text-lg font-bold">{t('details.enrolledSinceValue')}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t('details.recentActivity')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <p className="text-gray-600">{t('details.lastLogin')}</p>
                  <p className="text-gray-600">{t('details.lastAbsence')}</p>
                  <p className="text-gray-600">{t('details.homeworkDone')}</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <DialogFooter className="flex justify-between">
          <div>
            {!editMode && (
              <Button variant="outline" onClick={() => setEditMode(true)}>
                {tc('actions.edit')}
              </Button>
            )}
          </div>
          <div className="flex space-x-2">
            <Button variant="outline" onClick={onClose}>
              {editMode ? tc('actions.cancel') : tc('actions.close')}
            </Button>
            {editMode && (
              <Button onClick={handleSave}>
                {t('details.save')}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};