
import { Student } from '@/types';

interface StudentProfileHeaderProps {
  student: Student;
}

export const StudentProfileHeader = ({ student }: StudentProfileHeaderProps) => {
  return (
    <div className="bg-gradient-to-r from-edusign-600 to-edusign-500 py-6 px-6 flex flex-col items-center">
      <div className="h-24 w-24 rounded-full bg-white border-4 border-white overflow-hidden">
        {student.profileImage ? (
          <img
            src={student.profileImage}
            alt={student.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="h-full w-full bg-gray-200 flex items-center justify-center text-gray-500">
            {student.name
              .split(' ')
              .map((n) => n[0])
              .join('')}
          </div>
        )}
      </div>
      <h3 className="mt-4 text-xl font-semibold text-white">{student.name}</h3>
      <p className="text-sm text-white/80">{student.class}</p>
    </div>
  );
};
