import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Calendar, UserCheck, UserX, Clock, Search } from 'lucide-react';
import { useStrkAuth } from '@/hooks/useStrkAuth';
import { useStrkCourses } from '@/hooks/useStrkCourses';
import { fetchAttendanceByClass, type StrkAttendance } from '@/services/strkAttendanceService';
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

  // Load teacher's courses
  useEffect(() => {
    if (user?.id && user?.role === 'teacher') {
      loadCoursesByTeacher(user.id);
    }
  }, [user, loadCoursesByTeacher]);

  // Load attendance records for selected course
  useEffect(() => {
    const loadAttendanceData = async () => {
      if (selectedCourse && selectedCourse !== 'all') {
        setIsLoading(true);
        try {
          const records = await fetchAttendanceByClass(selectedCourse);
          setAttendanceRecords(records);
        } catch (error) {
          console.error('Error loading attendance:', error);
        } finally {
          setIsLoading(false);
        }
      } else {
        setAttendanceRecords([]);
      }
    };

    loadAttendanceData();
  }, [selectedCourse]);

  const getStatusIcon = (type: 'absence' | 'lateness') => {
    switch (type) {
      case 'lateness':
        return <Clock className="h-4 w-4 text-yellow-600" />;
      case 'absence':
        return <UserX className="h-4 w-4 text-red-600" />;
      default:
        return <UserCheck className="h-4 w-4 text-green-600" />;
    }
  };

  const getStatusColor = (type: 'absence' | 'lateness', justified?: boolean) => {
    if (justified) return 'secondary';
    switch (type) {
      case 'lateness':
        return 'secondary';
      case 'absence':
        return 'destructive';
      default:
        return 'default';
    }
  };

  const getStatusLabel = (type: 'absence' | 'lateness', justified?: boolean) => {
    const baseLabel = type === 'absence' ? 'Absent' : 'Retard';
    return justified ? `${baseLabel} (justifié)` : baseLabel;
  };

  const filteredRecords = attendanceRecords.filter(record => {
    const name = record.student_name?.toLowerCase() ?? '';
    const matchesSearch = searchTerm === '' || 
      name.includes(searchTerm.toLowerCase()) ||
      record.student_id.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = filterStatus === 'all' || record.type === filterStatus;
    
    return matchesSearch && matchesStatus;
  });

  const totalRecords = attendanceRecords.length;
  const lateStudents = attendanceRecords.filter(r => r.type === 'lateness').length;
  const absentStudents = attendanceRecords.filter(r => r.type === 'absence').length;
  const justifiedCount = attendanceRecords.filter(r => r.justified).length;

  return (
    <div className="space-y-6 py-6 animate-fade-in">
      <PresenceHubTabs />
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold">Gestion des Présences</h1>
          <p className="text-gray-500 mt-1">Prenez l'appel et suivez les présences de vos classes</p>
        </div>
        
        <Button onClick={() => setShowAttendanceDialog(true)}>
          <Calendar className="mr-2 h-4 w-4" />
          Faire l'appel
        </Button>
      </div>

      {/* Statistiques */}
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
              <div className="rounded-full bg-yellow-100 p-3">
                <Clock className="h-6 w-6 text-yellow-600" />
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

      {/* Filtres et liste */}
      <Card>
        <CardHeader>
          <CardTitle>Historique des présences</CardTitle>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-between items-center">
            <div className="relative w-full sm:max-w-xs">
              <Input
                type="text"
                placeholder="Rechercher un étudiant..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
              <Search className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
            </div>

             <div className="flex gap-2">
               <Select value={selectedCourse} onValueChange={setSelectedCourse}>
                 <SelectTrigger className="w-[200px]">
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
               <p className="text-gray-500">Chargement des données de présence...</p>
             </div>
           ) : filteredRecords.length > 0 ? (
             <div className="space-y-4">
               {filteredRecords.map((record) => (
                 <div key={record.id} className="flex justify-between items-center p-4 border rounded-lg">
                   <div className="flex items-center gap-4">
                     {getStatusIcon(record.type)}
                     <div>
                       <p className="font-medium">{record.student_name || 'Élève inconnu'}</p>
                       <p className="text-sm text-gray-500">
                         {[record.course_name, record.reason ? `Raison: ${record.reason}` : null]
                           .filter(Boolean)
                           .join(' · ')}
                       </p>
                     </div>
                   </div>
                   
                   <div className="flex items-center gap-4">
                     <span className="text-sm text-gray-500">
                       {new Date(record.date).toLocaleDateString('fr-FR')}
                     </span>
                     <Badge variant={getStatusColor(record.type, record.justified) as any}>
                       {getStatusLabel(record.type, record.justified)}
                     </Badge>
                   </div>
                 </div>
               ))}
             </div>
           ) : (
             <div className="text-center py-8">
               <Calendar className="h-12 w-12 mx-auto text-gray-400 mb-4" />
               <p className="text-gray-500">
                 {selectedCourse === 'all' 
                   ? 'Sélectionnez un cours pour voir les présences'
                   : 'Aucune donnée de présence disponible pour ce cours'
                 }
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
          // Rafraîchit l'historique si le cours de l'appel qu'on vient de
          // prendre est celui actuellement affiché.
          if (selectedCourse !== 'all') {
            fetchAttendanceByClass(selectedCourse).then(setAttendanceRecords);
          }
        }}
      />
    </div>
  );
}