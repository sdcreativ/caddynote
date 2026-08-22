
import { Building, School, GraduationCap, BookOpen } from 'lucide-react';

export const getInstitutionIcon = (type: string) => {
  switch (type) {
    case 'school':
      return School;
    case 'high_school':
      return BookOpen;
    case 'university':
      return GraduationCap;
    case 'middle_school':
      return School;
    case 'training_center':
      return Building;
    default:
      return Building;
  }
};

export const getInstitutionTypeLabel = (type: string) => {
  switch (type) {
    case 'school':
      return 'École';
    case 'high_school':
      return 'Lycée';
    case 'university':
      return 'Université';
    case 'middle_school':
      return 'Collège';
    case 'training_center':
      return 'Centre de Formation';
    default:
      return 'Établissement';
  }
};

export const institutionTypeOptions = [
  { value: 'school', label: 'École' },
  { value: 'middle_school', label: 'Collège' },
  { value: 'high_school', label: 'Lycée' },
  { value: 'university', label: 'Université' },
  { value: 'training_center', label: 'Centre de Formation' }
];
