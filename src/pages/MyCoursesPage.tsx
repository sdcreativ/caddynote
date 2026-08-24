import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { BookOpen, Clock, User, Calendar, ExternalLink, GraduationCap } from 'lucide-react';
import { useStrkAuth } from '@/hooks/useStrkAuth';
import { useToast } from '@/hooks/use-toast';
import { ApiError } from '@/lib/apiClient';
import { fetchCoursesByStudent, type CourseWithDetails } from '@/services/strkCourseService';
import { useTranslation } from 'react-i18next';
import { tCommon } from '@/i18n/config';

const formatSchedule = (course: CourseWithDetails, durationLabel?: string | null) => {
  const day = course.schedule_day || '—';
  const time = course.schedule_time || '—';
  const duration = durationLabel ?? null;
  return { day, time, duration };
};

const MyCoursesPage = () => {
  const { t } = useTranslation('teaching');
  const { user } = useStrkAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [courses, setCourses] = useState<CourseWithDetails[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id || user.role !== 'student') {
      setLoading(false);
      return;
    }
    void (async () => {
      setLoading(true);
      try {
        setCourses(await fetchCoursesByStudent(user.id));
      } catch (err) {
        toast({
          title: tCommon('status.error'),
          description: err instanceof ApiError ? err.message : t('myCourses.loadError'),
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [user?.id, user?.role, toast, t]);

  const bySubject = useMemo(() => {
    const map = new Map<string, CourseWithDetails[]>();
    for (const course of courses) {
      const key = course.subject_name || course.name || t('myCourses.unassignedSubject');
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(course);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, 'fr'));
  }, [courses, t]);

  if (user?.role && user.role !== 'student') {
    return (
      <EmptyState
        title={t('myCourses.studentSpace')}
        description={t('myCourses.studentOnly')}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('myCourses.title')}</h1>
        <p className="text-muted-foreground">{t('myCourses.subtitle')}</p>
      </div>

      {loading ? (
        <LoadingState label={t('myCourses.loading')} />
      ) : courses.length === 0 ? (
        <EmptyState
          title={t('myCourses.emptyTitle')}
          description={t('myCourses.emptyBody')}
        />
      ) : (
        <div className="space-y-8">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t('myCourses.mappingTitle')}</CardTitle>
              <CardDescription>{t('myCourses.mappingHint')}</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="divide-y rounded-lg border">
                {bySubject.map(([subjectName, subjectCourses]) => {
                  const teachers = [
                    ...new Set(
                      subjectCourses
                        .map((c) => c.teacher_name)
                        .filter((name): name is string => Boolean(name))
                    ),
                  ];
                  return (
                    <li
                      key={subjectName}
                      className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm"
                    >
                      <div className="flex items-center gap-2 font-medium text-slate-900">
                        <GraduationCap className="h-4 w-4 text-slate-400" aria-hidden />
                        {subjectName}
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-600">
                        <User className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                        {teachers.length > 0
                          ? teachers.join(', ')
                          : t('myCourses.teacherUnassigned')}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>

          <div className="grid gap-6">
            {courses.map((course) => {
              const { day, time, duration } = formatSchedule(
                course,
                course.duration ? t('myCourses.durationMin', { duration: course.duration }) : null
              );
              return (
                <Card key={course.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <BookOpen className="h-5 w-5" />
                          {course.subject_name || course.name}
                        </CardTitle>
                        <CardDescription>
                          {[
                            course.subject_name && course.name !== course.subject_name
                              ? course.name
                              : null,
                            course.class_name,
                          ]
                            .filter(Boolean)
                            .join(' · ') || t('myCourses.fallbackName')}
                        </CardDescription>
                      </div>
                      <Badge>
                        {course.status === 'active' ? t('myCourses.inProgress') : course.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <User className="h-4 w-4" />
                        <span>
                          <span className="text-slate-500">{t('myCourses.teacherLabel')} </span>
                          {course.teacher_name || t('myCourses.teacherUnassigned')}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        {day}
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        {time}
                        {duration ? ` · ${duration}` : ''}
                      </div>
                      {course.room && (
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs">
                          {course.room}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => navigate('/assignments')}>
                        {t('myCourses.viewAssignments')}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(`/courses/${course.id}`)}
                      >
                        {t('myCourses.courseMaterial')}
                      </Button>
                      <Button variant="ghost" size="sm" asChild>
                        <Link to={`/courses/${course.id}`}>
                          {t('myCourses.openCourse')}
                          <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default MyCoursesPage;
