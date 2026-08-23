import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Search, BookOpen, Users, Calendar } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useStrkAuth } from '@/hooks/useStrkAuth';
import { useStrkCourses } from '@/hooks/useStrkCourses';
import { useStrkSchedules } from '@/hooks/useStrkSchedules';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { CourseWithDetails } from '@/services/strkCourseService';

const DAY_LABELS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'] as const;

const TeachingPage = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const { t } = useTranslation('teaching');
  const { user } = useStrkAuth();
  const { courses, isLoading, loadCoursesByTeacher } = useStrkCourses();
  const { schedules, loadSchedulesByTeacher } = useStrkSchedules();
  const navigate = useNavigate();

  useEffect(() => {
    if (user?.role === 'teacher' || user?.role === 'head_teacher') {
      void loadCoursesByTeacher(user.id);
      void loadSchedulesByTeacher(user.id);
    }
  }, [user, loadCoursesByTeacher, loadSchedulesByTeacher]);

  const schedulesByCourse = useMemo(() => {
    const map = new Map<string, typeof schedules>();
    for (const slot of schedules) {
      const courseId = slot.course_id;
      if (!courseId) continue;
      const list = map.get(courseId) ?? [];
      list.push(slot);
      map.set(courseId, list);
    }
    return map;
  }, [schedules]);

  // Vérifier si l'utilisateur a le droit d'accéder à cette page
  if (user?.role !== 'teacher' && user?.role !== 'head_teacher') {
    return (
      <div className="space-y-6 py-6 animate-fade-in">
        <div className="text-center py-12">
          <BookOpen className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-lg font-semibold text-gray-900">{t('forbiddenTitle')}</h3>
          <p className="mt-1 text-sm text-gray-500">
            {t('forbiddenBody')}
          </p>
        </div>
      </div>
    );
  }

  const filteredCourses = courses.filter(course =>
    course.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (course.description || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getScheduleDisplay = (course: CourseWithDetails) => {
    const slots = schedulesByCourse.get(course.id) ?? [];
    if (slots.length > 0) {
      return slots
        .map((slot) => {
          const day = DAY_LABELS[slot.day_of_week] ?? '';
          return `${day} ${slot.start_time}-${slot.end_time}`;
        })
        .join(' · ');
    }
    if (course.schedule_day && course.schedule_time) {
      const duration = course.duration ? t('durationSuffix', { duration: course.duration }) : '';
      return `${course.schedule_day} ${course.schedule_time}${duration}`;
    }
    return t('scheduleUndefined');
  };

  const getRoomDisplay = (course: CourseWithDetails) => {
    const slots = schedulesByCourse.get(course.id) ?? [];
    const roomFromSlot = slots.find((s) => s.room)?.room;
    return roomFromSlot || course.room || t('roomUndefined');
  };

  const getTotalStudents = () => {
    return courses.reduce((total, course) => total + (course.student_count || 0), 0);
  };

  const getTotalHours = () => {
    if (schedules.length > 0) {
      const minutes = schedules.reduce((total, slot) => {
        const [sh, sm] = slot.start_time.split(':').map(Number);
        const [eh, em] = slot.end_time.split(':').map(Number);
        if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return total;
        return total + (eh * 60 + em - (sh * 60 + sm));
      }, 0);
      return minutes / 60;
    }
    return courses.reduce((total, course) => total + (course.duration || 0), 0) / 60;
  };

  const handleAttendance = (courseId: string) => {
    navigate(`/teacher-attendance?course=${courseId}`);
  };

  const handleCourseDetails = (courseId: string) => {
    navigate(`/courses/${courseId}`);
  };

  const handlePlanningClick = () => {
    navigate('/calendar');
  };

  return (
    <div className="space-y-6 py-6 animate-fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0">
        <div>
          <h1 className="text-3xl font-bold">{t('title')}</h1>
          <p className="text-gray-500 mt-1">
            {t('subtitle')}
          </p>
        </div>
        
        <Button variant="outline" onClick={handlePlanningClick}>
          <Calendar className="mr-2 h-4 w-4" />
          {t('planning')}
        </Button>
      </div>

      {/* Statistiques rapides */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="rounded-full bg-blue-100 p-3">
                <BookOpen className="h-6 w-6 text-blue-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">{t('activeCourses')}</p>
                <p className="text-2xl font-bold text-gray-900">{courses.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="rounded-full bg-green-100 p-3">
                <Users className="h-6 w-6 text-green-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">{t('totalStudents')}</p>
                <p className="text-2xl font-bold text-gray-900">
                  {getTotalStudents()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="rounded-full bg-purple-100 p-3">
                <Calendar className="h-6 w-6 text-purple-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">{t('hoursPerWeek')}</p>
                <p className="text-2xl font-bold text-gray-900">{t('hoursValue', { hours: getTotalHours().toFixed(1) })}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recherche */}
      <div className="bg-white shadow-sm rounded-lg p-6">
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-center mb-6">
          <div className="relative w-full sm:max-w-xs">
            <Input
              type="text"
              placeholder={t('searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
            <Search className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
          </div>
        </div>

        {/* Liste des cours */}
        {isLoading ? (
          <div className="text-center py-12">
            <p className="text-gray-500">{t('loading')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {filteredCourses.map((course) => (
              <Card key={course.id} className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-lg">{course.name}</CardTitle>
                      <p className="text-sm text-gray-500 mt-1">{course.description}</p>
                    </div>
                    <Badge variant="secondary">
                      {t('studentCount', { count: course.student_count || 0 })}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center text-sm text-gray-600">
                      <Calendar className="h-4 w-4 mr-2 shrink-0" />
                      <span>{getScheduleDisplay(course)}</span>
                    </div>
                    
                    <div className="flex items-center text-sm text-gray-600">
                      <BookOpen className="h-4 w-4 mr-2" />
                      {getRoomDisplay(course)}
                    </div>
                    
                    {course.class_name && (
                      <div className="flex items-center text-sm text-gray-600">
                        <Users className="h-4 w-4 mr-2" />
                        {t('classLabel', { name: course.class_name })}
                      </div>
                    )}
                    
                    <div className="flex items-center justify-between pt-2">
                      <span className="text-sm text-gray-500">
                        {t('statusLabel', { status: course.status === 'active' ? t('statusActive') : t('statusInactive') })}
                      </span>
                      <div className="flex gap-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleAttendance(course.id)}
                        >
                          {t('takeAttendance')}
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => handleCourseDetails(course.id)}
                        >
                          {t('details')}
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {filteredCourses.length === 0 && !isLoading && (
          <div className="text-center py-12">
            <BookOpen className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-semibold text-gray-900">{t('emptyTitle')}</h3>
            <p className="mt-1 text-sm text-gray-500">
              {searchTerm ? t('emptySearch') : t('emptyNone')}
            </p>
            {!searchTerm && (
              <Button variant="outline" className="mt-4" onClick={handlePlanningClick}>
                <Calendar className="mr-2 h-4 w-4" />
                {t('viewPlanning')}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Actions rapides */}
      <Card>
        <CardHeader>
          <CardTitle>{t('quickActions')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <button 
              className="p-4 border rounded-lg hover:bg-gray-50 text-center"
              onClick={() => navigate('/teacher-attendance')}
            >
              <Users className="h-6 w-6 mx-auto mb-2 text-blue-600" />
              <span className="text-sm">{t('takeAttendance')}</span>
            </button>
            
            <button 
              className="p-4 border rounded-lg hover:bg-gray-50 text-center"
              onClick={() => navigate('/teacher-assignments')}
            >
              <BookOpen className="h-6 w-6 mx-auto mb-2 text-green-600" />
              <span className="text-sm">{t('manageAssignments')}</span>
            </button>
            
            <button 
              className="p-4 border rounded-lg hover:bg-gray-50 text-center"
              onClick={handlePlanningClick}
            >
              <Calendar className="h-6 w-6 mx-auto mb-2 text-purple-600" />
              <span className="text-sm">{t('viewPlanning')}</span>
            </button>
            
            <button 
              className="p-4 border rounded-lg hover:bg-gray-50 text-center"
              onClick={() => navigate('/grades')}
            >
              <Users className="h-6 w-6 mx-auto mb-2 text-orange-600" />
              <span className="text-sm">{t('manageGrades')}</span>
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default TeachingPage;
