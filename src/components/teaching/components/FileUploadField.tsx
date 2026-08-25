
import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, FileUp, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { uploadViaPresignedPost } from '@/lib/s3Upload';
import { ApiError } from '@/lib/apiClient';
import { useTranslation } from 'react-i18next';

interface FileUploadFieldProps {
  id: string;
  label: string;
  required?: boolean;
  folder?: 'devoirs' | 'exercices' | 'cours' | 'documents';
  onFileUploaded?: (file: File, key: string) => void;
}

const FileUploadField = ({
  id,
  label,
  required = false,
  folder = 'devoirs',
  onFileUploaded,
}: FileUploadFieldProps) => {
  const { toast } = useToast();
  const { t } = useTranslation('teaching');
  const [isUploading, setIsUploading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setFileName(file.name);
    try {
      const key = await uploadViaPresignedPost(folder, file);
      toast({
        title: t('fileUpload.sentTitle'),
        description: t('fileUpload.sentBody', { name: file.name }),
      });
      onFileUploaded?.(file, key);
    } catch (error) {
      setFileName(null);
      const message =
        error instanceof ApiError && error.status === 501
          ? t('fileUpload.s3Missing')
          : error instanceof Error
            ? error.message
            : t('fileUpload.sendError');
      toast({
        title: t('fileUpload.sendImpossible'),
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {label}
        {required && <span className="text-red-500">*</span>}
      </Label>
      <div className="flex flex-col gap-2">
        <Input
          id={id}
          type="file"
          className="hidden"
          ref={fileInputRef}
          onChange={handleFileChange}
        />
        <Button
          type="button"
          variant="outline"
          onClick={triggerFileInput}
          disabled={isUploading}
          className="w-full"
        >
          {isUploading ? (
            <>
              <Upload className="w-4 h-4 mr-2 animate-pulse" />
              {t('fileUpload.uploading')}
            </>
          ) : fileName ? (
            <>
              <CheckCircle className="w-4 h-4 mr-2 text-green-500" />
              {fileName}
            </>
          ) : (
            <>
              <FileUp className="w-4 h-4 mr-2" />
              {t('fileUpload.upload')}
            </>
          )}
        </Button>
        {fileName && (
          <p className="text-xs text-muted-foreground mt-1 truncate">
            {fileName}
          </p>
        )}
      </div>
    </div>
  );
};

export default FileUploadField;
