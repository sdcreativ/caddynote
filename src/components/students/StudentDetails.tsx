
import { Student } from '@/types';
import { Progress } from '@/components/ui/progress';

interface StudentDetailsProps {
  student: Student;
}

export const StudentDetails = ({ student }: StudentDetailsProps) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-600">Taux de présence</span>
        <span className="font-semibold">{student.attendanceRate ?? 0}%</span>
      </div>
      
      <Progress 
        value={student.attendanceRate ?? 0} 
        className={`h-2 ${
          (student.attendanceRate ?? 0) > 90 ? 'bg-green-100' : 
          (student.attendanceRate ?? 0) > 75 ? 'bg-yellow-100' : 'bg-red-100'
        }`}
      />
      
      <div className="flex items-center space-x-2 text-xs text-gray-500 mt-1">
        <span className="w-3 h-3 rounded-full bg-green-500"></span>
        <span>Bon</span>
        <span className="w-3 h-3 rounded-full bg-yellow-500 ml-2"></span>
        <span>Moyen</span>
        <span className="w-3 h-3 rounded-full bg-red-500 ml-2"></span>
        <span>Préoccupant</span>
      </div>
    </div>
  );
};
