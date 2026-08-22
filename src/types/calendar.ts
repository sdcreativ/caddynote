
export interface Event {
  id: string;
  title: string;
  date: Date;
  startTime: string;
  endTime: string;
  type: 'cours' | 'examen' | 'reunion' | 'devoir';
  className: string;
  teacherName: string;
  location?: string;
  description?: string;
  color?: string;
}
