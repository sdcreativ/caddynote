
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, Mail, DownloadCloud } from 'lucide-react';
import { CourseStudent } from '@/types';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';

interface ViewStudentsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  courseId: string;
  courseName: string;
}

const mockStudents: CourseStudent[] = [
  {
    id: "1",
    courseId: "course123", 
    studentId: "student1",
    enrollmentDate: "2023-09-01",
    grade: 85,
    studentName: "Émilie Martin",
    email: "emilie.martin@example.com",
    profileImage: "/avatars/student1.jpg",
    attendanceRate: 95,
    progress: 80
  },
  {
    id: "2",
    courseId: "course123",
    studentId: "s2",
    enrollmentDate: "2023-09-01",
    studentName: "Lucas Dubois",
    email: "lucas.dubois@example.com",
    profileImage: "",
    attendanceRate: 88,
    progress: 72,
  },
  {
    id: "3",
    courseId: "course123",
    studentId: "s3",
    enrollmentDate: "2023-09-01",
    studentName: "Léa Bernard",
    email: "lea.bernard@example.com",
    profileImage: "",
    attendanceRate: 100,
    progress: 95,
  },
  {
    id: "4",
    courseId: "course123",
    studentId: "s4",
    enrollmentDate: "2023-09-01",
    studentName: "Thomas Petit",
    email: "thomas.petit@example.com",
    profileImage: "",
    attendanceRate: 78,
    progress: 65,
  },
  {
    id: "5",
    courseId: "course123",
    studentId: "s5",
    enrollmentDate: "2023-09-01",
    studentName: "Camille Roux",
    email: "camille.roux@example.com",
    profileImage: "",
    attendanceRate: 92,
    progress: 80,
  },
];

const ViewStudentsDialog = ({ isOpen, onClose, courseId, courseName }: ViewStudentsDialogProps) => {
  const [students, setStudents] = useState<CourseStudent[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const { t } = useTranslation('teaching');
  const { t: tc } = useTranslation('common');

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      // Simuler un chargement des données
      setTimeout(() => {
        setStudents(mockStudents);
        setIsLoading(false);
      }, 800);
    }
  }, [isOpen]);

  const filteredStudents = students.filter((student) =>
    (student.studentName ?? '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (student.email ?? '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase();
  };

  const getProgressColor = (progress: number) => {
    if (progress >= 90) return 'bg-green-100 text-green-800';
    if (progress >= 70) return 'bg-blue-100 text-blue-800';
    if (progress >= 50) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  const getAttendanceColor = (rate: number) => {
    if (rate >= 90) return 'bg-green-100 text-green-800';
    if (rate >= 70) return 'bg-blue-100 text-blue-800';
    if (rate >= 50) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  const handleExportData = () => {
    toast({
      title: t('viewStudents.exportTitle'),
      description: t('viewStudents.exportBody'),
    });
  };

  const handleContactStudent = (email: string) => {
    window.location.href = `mailto:${email}`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>{t('viewStudents.title', { name: courseName })}</DialogTitle>
          <DialogDescription>
            {t('viewStudents.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-between items-center mb-4">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('viewStudents.searchPlaceholder')}
              className="pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Button variant="outline" size="sm" onClick={handleExportData}>
            <DownloadCloud className="h-4 w-4 mr-2" />
            {tc('actions.export')}
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
          </div>
        ) : (
          <>
            <div className="overflow-auto max-h-[50vh]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('viewStudents.student')}</TableHead>
                    <TableHead>{t('viewStudents.attendance')}</TableHead>
                    <TableHead>{t('viewStudents.progress')}</TableHead>
                    <TableHead className="text-right">{t('viewStudents.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredStudents.length > 0 ? (
                    filteredStudents.map((student) => (
                      <TableRow key={student.id}>
                        <TableCell>
                          <div className="flex items-center space-x-3">
                            <Avatar>
                              <AvatarImage
                                src={student.profileImage}
                                alt={student.studentName}
                              />
                              <AvatarFallback>{getInitials(student.studentName ?? '?')}</AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="font-medium">{student.studentName}</div>
                              <div className="text-sm text-muted-foreground">{student.email}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={getAttendanceColor(student.attendanceRate ?? 0)}>
                            {student.attendanceRate ?? 0}%
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={getProgressColor(student.progress ?? 0)}>
                            {student.progress ?? 0}%
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleContactStudent(student.email ?? '')}
                          >
                            <Mail className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-6">
                        {t('viewStudents.empty')}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="mt-4 text-sm text-muted-foreground">
              <p>
                <span className="font-medium">{t('viewStudents.qualiopi')}</span> {t('viewStudents.qualiopiBody')}
              </p>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ViewStudentsDialog;
