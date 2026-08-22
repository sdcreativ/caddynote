import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Calendar as CalendarIcon, Plus, X, Timer, Sparkles, Eye, FileText, EyeOff, Clock } from 'lucide-react';
import { Assignment } from '@/types';
import { v4 as uuidv4 } from 'uuid';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { fr } from 'date-fns/locale';
import FileUploadField from './components/FileUploadField';
import AIGenerationDialog from './components/AIGenerationDialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTranslation } from 'react-i18next';
import { tCommon } from '@/i18n/config';

interface CreateAssignmentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  courseId: string;
  onAssignmentCreated: (assignment: Assignment) => void;
}

const CreateAssignmentDialog = ({ isOpen, onClose, courseId, onAssignmentCreated }: CreateAssignmentDialogProps) => {
  const { toast } = useToast();
  const { t } = useTranslation('teaching');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined);
  const [points, setPoints] = useState<number>(10);
  const [requirements, setRequirements] = useState<string[]>([]);
  const [newRequirement, setNewRequirement] = useState('');
  const [isQualiopiCompliant, setIsQualiopiCompliant] = useState(true);
  const [status, setStatus] = useState<'draft' | 'published'>('draft');
  const [isVisible, setIsVisible] = useState(true);
  const [timeLimit, setTimeLimit] = useState<number | null>(null);
  const [timeLimitUnit, setTimeLimitUnit] = useState<'minutes' | 'hours'>('minutes');
  const [hasAttachment, setHasAttachment] = useState(false);
  const [attachmentKey, setAttachmentKey] = useState<string | null>(null);
  const [showAIDialog, setShowAIDialog] = useState(false);

  const handleCreateAssignment = () => {
    if (!title) {
      toast({
        title: tCommon('status.error'),
        description: t('createAssignment.titleRequired'),
        variant: "destructive",
      });
      return;
    }

    if (!dueDate) {
      toast({
        title: tCommon('status.error'),
        description: t('createAssignment.dueRequired'),
        variant: "destructive",
      });
      return;
    }

    // Calcul du temps limite en minutes
    const timeLimitInMinutes = timeLimit 
      ? (timeLimitUnit === 'hours' ? timeLimit * 60 : timeLimit)
      : null;

    // Création d'un nouveau devoir
    const formData = {
      title,
      description,
      dueDate: dueDate.toISOString(),
      points,
      status: status,
      createdAt: new Date().toISOString(),
      requirements,
      qualiopiCompliant: isQualiopiCompliant,
      visible: isVisible,
      timeLimit: timeLimitInMinutes,
      file: attachmentKey || undefined
    };

    // Pour l'erreur à la ligne 77 sur la propriété points
    const assignmentData: Assignment = {
      id: uuidv4(),
      courseId,
      title: formData.title,
      description: formData.description,
      dueDate: formData.dueDate,
      createdAt: new Date().toISOString(),
      points: formData.points || 0 // Ajout de la propriété points
    };

    // Envoi du devoir au parent
    onAssignmentCreated(assignmentData);

    // Notification
    toast({
      title: tCommon('status.success'),
      description: status === 'draft' ? t('createAssignment.draftSuccess') : t('createAssignment.publishedSuccess'),
    });

    // Réinitialisation du formulaire
    resetForm();
    onClose();
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setDueDate(undefined);
    setPoints(10);
    setRequirements([]);
    setNewRequirement('');
    setIsQualiopiCompliant(true);
    setStatus('draft');
    setIsVisible(true);
    setTimeLimit(null);
    setTimeLimitUnit('minutes');
    setHasAttachment(false);
    setAttachmentKey(null);
  };

  const addRequirement = () => {
    if (newRequirement.trim() !== '') {
      setRequirements([...requirements, newRequirement.trim()]);
      setNewRequirement('');
    }
  };

  const removeRequirement = (index: number) => {
    const updatedRequirements = [...requirements];
    updatedRequirements.splice(index, 1);
    setRequirements(updatedRequirements);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addRequirement();
    }
  };

  const handleFileUploaded = (_file: File, key: string) => {
    setHasAttachment(true);
    setAttachmentKey(key);
    toast({
      title: t('createAssignment.fileAttachedTitle'),
      description: t('createAssignment.fileAttachedBody')
    });
  };

  const handleContentGenerated = (_type: string, content: string) => {
    setDescription(content);
    toast({
      title: t('createAssignment.contentIntegratedTitle'),
      description: t('createAssignment.contentIntegratedBody')
    });
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[650px]">
          <DialogHeader>
            <DialogTitle>{t('createAssignment.title')}</DialogTitle>
            <DialogDescription>
              {t('createAssignment.description')}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">{t('createAssignment.titleLabel')}<span className="text-red-500">*</span></Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('createAssignment.titlePlaceholder')}
                required
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label htmlFor="description">{t('createAssignment.desc')}</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAIDialog(true)}
                  className="flex items-center gap-1"
                >
                  <Sparkles className="h-4 w-4" />
                  {t('createAssignment.generateAi')}
                </Button>
              </div>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('createAssignment.descPlaceholder')}
                rows={5}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="dueDate">{t('createAssignment.dueDate')}<span className="text-red-500">*</span></Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      id="dueDate"
                      variant={"outline"}
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !dueDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dueDate ? format(dueDate, "PPP", { locale: fr }) : t('createAssignment.selectDate')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={dueDate}
                      onSelect={setDueDate}
                      initialFocus
                      disabled={(date) => date < new Date()}
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label htmlFor="points">{t('createAssignment.points')}</Label>
                <Input
                  id="points"
                  type="number"
                  min="0"
                  value={points}
                  onChange={(e) => setPoints(parseInt(e.target.value))}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="timeLimit" className="flex items-center gap-2">
                  <Timer className="h-4 w-4" />
                  {t('createAssignment.timeLimit')}
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="timeLimit"
                    type="number"
                    min="1"
                    placeholder={t('createAssignment.duration')}
                    value={timeLimit || ''}
                    onChange={(e) => setTimeLimit(e.target.value ? parseInt(e.target.value) : null)}
                    className="flex-1"
                  />
                  <Select 
                    value={timeLimitUnit} 
                    onValueChange={(value) => setTimeLimitUnit(value as 'minutes' | 'hours')}
                  >
                    <SelectTrigger className="w-[120px]">
                      <SelectValue placeholder={t('createAssignment.unit')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="minutes">{t('createAssignment.minutes')}</SelectItem>
                      <SelectItem value="hours">{t('createAssignment.hours')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {timeLimit && (
                  <p className="text-xs text-muted-foreground">
                    {t('createAssignment.timeLimitHint', {
                      count: timeLimit,
                      unit: timeLimitUnit === 'minutes' ? t('createAssignment.minutesUnit') : t('createAssignment.hoursUnit'),
                    })}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <FileUploadField
                  id="assignment-file"
                  label={t('createAssignment.attachment')}
                  onFileUploaded={handleFileUploaded}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('createAssignment.criteria')}</Label>
              <div className="flex items-center space-x-2">
                <Input
                  value={newRequirement}
                  onChange={(e) => setNewRequirement(e.target.value)}
                  placeholder={t('createAssignment.criteriaPlaceholder')}
                  onKeyDown={handleKeyDown}
                />
                <Button type="button" size="sm" onClick={addRequirement}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {requirements.map((req, index) => (
                  <Badge key={index} variant="secondary" className="flex items-center gap-1">
                    {req}
                    <button
                      type="button"
                      onClick={() => removeRequirement(index)}
                      className="ml-1 rounded-full hover:bg-muted p-1"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="flex items-center space-x-2">
                <Switch
                  id="qualiopi"
                  checked={isQualiopiCompliant}
                  onCheckedChange={setIsQualiopiCompliant}
                />
                <Label htmlFor="qualiopi" className="cursor-pointer">
                  {t('createAssignment.qualiopi')}
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="visibility"
                  checked={isVisible}
                  onCheckedChange={setIsVisible}
                />
                <Label htmlFor="visibility" className="cursor-pointer flex items-center">
                  {isVisible ? (
                    <>
                      <Eye className="h-4 w-4 mr-1 text-green-500" />
                      {t('createAssignment.visible')}
                    </>
                  ) : (
                    <>
                      <EyeOff className="h-4 w-4 mr-1 text-gray-500" />
                      {t('createAssignment.hidden')}
                    </>
                  )}
                </Label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <div className="flex justify-between w-full">
              <div className="text-sm text-muted-foreground">
                <span className="text-red-500">*</span> {t('createAssignment.requiredFields')}
              </div>
              <div className="flex space-x-2">
                <Button variant="outline" onClick={onClose}>
                  {tCommon('actions.cancel')}
                </Button>
                <Button 
                  variant="secondary" 
                  onClick={() => {
                    setStatus('draft');
                    handleCreateAssignment();
                  }}
                  disabled={!title || !dueDate}
                >
                  {t('createAssignment.saveDraft')}
                </Button>
                <Button 
                  onClick={() => {
                    setStatus('published');
                    handleCreateAssignment();
                  }}
                  disabled={!title || !dueDate}
                >
                  {t('createAssignment.publish')}
                </Button>
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AIGenerationDialog 
        isOpen={showAIDialog}
        onClose={() => setShowAIDialog(false)}
        onContentGenerated={handleContentGenerated}
      />
    </>
  );
};

export default CreateAssignmentDialog;
