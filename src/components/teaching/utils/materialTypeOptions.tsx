
import { FileType, Link, BookOpen } from 'lucide-react';
import type { TFunction } from 'i18next';

export interface MaterialTypeOption {
  value: 'document' | 'video' | 'link' | 'other';
  label: string;
  icon: JSX.Element;
}

export const getMaterialTypeOptions = (t: TFunction): MaterialTypeOption[] => [
  {
    value: 'document',
    label: t('materialTypes.document'),
    icon: <FileType className="w-4 h-4 mr-2" />
  },
  {
    value: 'video',
    label: t('materialTypes.video'),
    icon: <BookOpen className="w-4 h-4 mr-2" />
  },
  {
    value: 'link',
    label: t('materialTypes.link'),
    icon: <Link className="w-4 h-4 mr-2" />
  },
  {
    value: 'other',
    label: t('materialTypes.other'),
    icon: <FileType className="w-4 h-4 mr-2" />
  }
];
