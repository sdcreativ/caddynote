
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getMaterialTypeOptions } from '../utils/materialTypeOptions';
import FileUploadField from './FileUploadField';
import { useTranslation } from 'react-i18next';

interface MaterialFormFieldsProps {
  title: string;
  setTitle: (value: string) => void;
  description: string;
  setDescription: (value: string) => void;
  type: 'document' | 'video' | 'link' | 'other';
  setType: (value: any) => void;
  url: string;
  setUrl: (value: string) => void;
  isQualiopiCompliant: boolean;
  setIsQualiopiCompliant: (value: boolean) => void;
}

const MaterialFormFields = ({
  title,
  setTitle,
  description,
  setDescription,
  type,
  setType,
  url,
  setUrl,
  isQualiopiCompliant,
  setIsQualiopiCompliant
}: MaterialFormFieldsProps) => {
  const { t } = useTranslation('teaching');
  const materialTypeOptions = getMaterialTypeOptions(t);

  return (
    <div className="grid gap-4 py-4">
      <div className="space-y-2">
        <Label htmlFor="title">{t('materialForm.title')}<span className="text-red-500">*</span></Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('materialForm.titlePlaceholder')}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">{t('materialForm.desc')}</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('materialForm.descPlaceholder')}
          rows={3}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="type">{t('materialForm.type')}<span className="text-red-500">*</span></Label>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger id="type">
            <SelectValue placeholder={t('materialForm.selectType')} />
          </SelectTrigger>
          <SelectContent>
            {materialTypeOptions.map(option => (
              <SelectItem key={option.value} value={option.value}>
                <div className="flex items-center">
                  {option.icon}
                  <span>{option.label}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {type === 'link' ? (
        <div className="space-y-2">
          <Label htmlFor="url">{t('materialForm.url')}<span className="text-red-500">*</span></Label>
          <Input
            id="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://..."
            type="url"
            required
          />
        </div>
      ) : (
        <FileUploadField id="file" label={t('materialForm.file')} required />
      )}

      <div className="flex items-center space-x-2 pt-2">
        <Switch
          id="qualiopi"
          checked={isQualiopiCompliant}
          onCheckedChange={setIsQualiopiCompliant}
        />
        <Label htmlFor="qualiopi" className="cursor-pointer">
          {t('materialForm.qualiopi')}
        </Label>
      </div>
    </div>
  );
};

export default MaterialFormFields;
