import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Calendar, UserCheck, UserX, Clock, Search } from 'lucide-react';
import { useStrkAuth } from '@/hooks/useStrkAuth';
import { useStrkCourses } from '@/hooks/useStrkCourses';
import {
  fetchAttendanceHistoryForCourses,
  type StrkAttendance,
} from '@/services/strkAttendanceService';
import { AttendanceDialog } from '@/components/attendance/AttendanceDialog';
import { PresenceHubTabs } from '@/components/attendance/PresenceHubTabs';
import { useSearchParams } from 'react-router-dom';

export default function TeacherAttendancePage() {
  const { user } = useStrkAuth();
  const { courses, loadCoursesByTeacher } = useStrkCourses();
  const [searchParams] = useSearchParams();
  const courseParam = searchParams.get('course');

  const [attendanceRecords, setAttendanceRecords] = useState<StrkAttendance[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCourse, setSelectedCourse] = useState(courseParam || 'all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showAttendanceDialog, setShowAttendanceDialog] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (user?.id && (user.role === 'teacher' || user.role === 'head_teacher')) {
      loadCoursesByTeacher(user.id);
    }
  }, [user, loadCoursesByTeacher]);

  useEffect(() => {
    if (courseParam && courses.some((c) => c.id === courseParam)) {
      setSelectedCourse(courseParam);
    }
  }, [courseParam, courses]);

  const reloadHistory = async () => {
    if (courses.length === 0) {
      setAttendanceRecords([]);
      return;
    }

    const targetCourses =
      selectedCourse === 'all' ? courses : courses.filter((c) => c.id === selectedCourse);

    if (targetCourses.length === 0) {
      setAttendanceRecords([]);
      return;
    }

    setIsLoading(true);
    try {
      const courseNameById = new Map(courses.map((c) => [c.id, c.name]));
      const records = await fetchAttendanceHistoryForCourses(
        targetCourses.map((c) => c.id),
        {
          classIds: targetCourses.map((c) => c.class_id).filter((id): id is string => !!id),
          courseNameById,
        }
      );
      setAttendanceRecords(records);
    } catch (error) {
      console.error('Error loading attendance:', error);
      setAttendanceRecords([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void reloadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when course filter or catalogue change
  }, [selectedCourse, courses]);

  const getStatusIcon = (type: 'absence' | 'lateness') => {
    if (type === 'lateness') return <Clock className="h-5 w-5 text-amber-600" aria-hidden />;
    return <UserX className="h-5 w-5 text-red-600" aria-hidden />;
  };

  const getStatusColor = (type: 'absence' | 'lateness', justified?: boolean) => {
    if (justified) return 'secondary';
    return type === 'absence' ? 'destructive' : 'secondary';
  };

  const getStatusLabel = (type: 'absence' | 'lateness', justified?: boolean) => {
    const baseLabel = type === 'absence' ? 'Absent' : 'En retard';
    return justified ? `${baseLabel} · justifié` : baseLabel;
  };

  const filteredRecords = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return attendanceRecords.filter((record) => {
      const name = (record.student_name || '').toLowerCase();
      const course = (record.course_name || '').toLowerCase();
      const matchesSearch =
        q === '' || name.includes(q) || course.includes(q) || record.student_id.toLowerCase().includes(q);
      const matchesStatus = filterStatus === 'all' || record.type === filterStatus;
      return matchesSearch && matchesStatus;
    });
  }, [attendanceRecords, searchTerm, filterStatus]);

  const totalRecords = attendanceRecords.length;
  const lateStudents = attendanceRecords.filter((r) => r.type === 'lateness').length;
  const absentStudents = attendanceRecords.filter((r) => r.type === 'absence').length;
  const justifiedCount = attendanceRecords.filter((r) => r.justified).length;

  const selectedCourseLabel =
    selectedCourse === 'all'
      ? 'tous vos cours'
      : courses.find((c) => c.id === selectedCourse)?.name || 'ce cours';

  return (
    <div className="space-y-6 py-6 animate-fade-in">
      <PresenceHubTabs />
      <div className="flex justify-between items-start gap-4">
        <div>
          <h1 className="text-3xl font-bold">Gestion des Présences</h1>
          <p className="text-gray-500 mt-1">Prenez l’appel et suivez qui est absent ou en retard</p>
        </div>

        <Button onClick={() => setShowAttendanceDialog(true)}>
          <Calendar className="mr-2 h-4 w-4" />
          Faire l’appel
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="rounded-full bg-blue-100 p-3">
                <Calendar className="h-6 w-6 text-blue-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total enregistrements</p>
                <p className="text-2xl font-bold text-gray-900">{totalRecords}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="rounded-full bg-green-100 p-3">
                <UserCheck className="h-6 w-6 text-green-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Justifiés</p>
                <p className="text-2xl font-bold text-gray-900">{justifiedCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="rounded-full bg-amber-100 p-3">
                <Clock className="h-6 w-6 text-amber-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Retards</p>
                <p className="text-2xl font-bold text-gray-900">{lateStudents}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="rounded-full bg-red-100 p-3">
                <UserX className="h-6 w-6 text-red-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Absents</p>
                <p className="text-2xl font-bold text-gray-900">{absentStudents}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Qui est absent ou en retard ?</CardTitle>
          <CardDescription>
            Liste nominative pour {selectedCourseLabel}. Chaque ligne indique l’élève, le statut et la
            date.
          </CardDescription>

          <div className="flex flex-col sm:flex-row gap-4 justify-between items-center pt-2">
            <div className="relative w-full sm:max-w-xs">
              <Input
                type="text"
                placeholder="Rechercher un élève…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
                aria-label="Rechercher un élève"
              />
              <Search className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" aria-hidden />
            </div>

            <div className="flex gap-2 w-full sm:w-auto">
              <Select value={selectedCourse} onValueChange={setSelectedCourse}>
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue placeholder="Sélectionner un cours" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les cours</SelectItem>
                  {courses.map((course) => (
                    <SelectItem key={course.id} value={course.id}>
                      {course.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Statut" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous</SelectItem>
                  <SelectItem value="lateness">Retards</SelectItem>
                  <SelectItem value="absence">Absences</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">
              <p className="text-gray-500">Chargement de l’historique…</p>
            </div>
          ) : filteredRecords.length > 0 ? (
            <ul className="divide-y rounded-lg border">
              {filteredRecords.map((record) => (
                <li
                  key={record.id}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="mt-0.5 shrink-0">{getStatusIcon(record.type)}</div>
                    <div className="min-w-0">
                      <p className="font-semibold text-base truncate">
                        {record.student_name || 'Élève inconnu'}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {[
                          record.course_name,
                          record.duration ? `${record.duration} min` : null,
                          record.reason ? `Motif : ${record.reason}` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 sm:shrink-0 pl-8 sm:pl-0">
                    <time className="text-sm text-muted-foreground tabular-nums" dateTime={record.date}>
                      {new Date(record.date).toLocaleDateString('fr-FR', {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </time>
                    <Badge variant={getStatusColor(record.type, record.justified) as 'default' | 'secondary' | 'destructive'}>
                      {getStatusLabel(record.type, record.justified)}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-center py-8">
              <Calendar className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <p className="text-gray-500">
                {courses.length === 0
                  ? 'Aucun cours assigné pour le moment.'
                  : 'Aucun absents ni retards pour ce filtre.'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <AttendanceDialog
        open={showAttendanceDialog}
        onOpenChange={setShowAttendanceDialog}
        courses={courses}
        institutionId={user?.institutionId}
        onAttendanceSubmitted={() => {
          void reloadHistory();
        }}
      />
    </div>
  );
}
