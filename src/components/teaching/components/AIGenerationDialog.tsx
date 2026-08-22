
import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Sparkles, Loader2, FileText, CheckSquare, Upload, BookOpen } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useTranslation } from 'react-i18next';
import { tCommon } from '@/i18n/config';

type GenerationType = 'qcm' | 'written' | 'activity';

interface AIGenerationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onContentGenerated: (type: GenerationType, content: string) => void;
}

interface PromptTemplate {
  title: string;
  placeholder: string;
  contextLabel: string;
  contextPlaceholder: string;
}

const AIGenerationDialog = ({ isOpen, onClose, onContentGenerated }: AIGenerationDialogProps) => {
  const { toast } = useToast();
  const { t } = useTranslation('teaching');
  const [activeTab, setActiveTab] = useState<GenerationType>('qcm');
  const [title, setTitle] = useState('');
  const [context, setContext] = useState('');
  const [courseContent, setCourseContent] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState('');

  const prompts: Record<GenerationType, PromptTemplate> = {
    qcm: {
      title: t('aiGeneration.prompts.qcmTitle'),
      placeholder: t('aiGeneration.prompts.qcmPlaceholder'),
      contextLabel: t('aiGeneration.prompts.qcmContextLabel'),
      contextPlaceholder: t('aiGeneration.prompts.qcmContextPlaceholder')
    },
    written: {
      title: t('aiGeneration.prompts.writtenTitle'),
      placeholder: t('aiGeneration.prompts.writtenPlaceholder'),
      contextLabel: t('aiGeneration.prompts.writtenContextLabel'),
      contextPlaceholder: t('aiGeneration.prompts.writtenContextPlaceholder')
    },
    activity: {
      title: t('aiGeneration.prompts.activityTitle'),
      placeholder: t('aiGeneration.prompts.activityPlaceholder'),
      contextLabel: t('aiGeneration.prompts.activityContextLabel'),
      contextPlaceholder: t('aiGeneration.prompts.activityContextPlaceholder')
    }
  };

  const handleGenerate = () => {
    if (!title) {
      toast({
        title: t('aiGeneration.titleRequired'),
        description: t('aiGeneration.titleRequiredBody'),
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);

    // Simulation de génération (pas d'appel API réel)
    setTimeout(() => {
      let content = '';
      
      if (activeTab === 'qcm') {
        content = generateMockQCM(title, context, courseContent);
      } else if (activeTab === 'written') {
        content = generateMockWrittenAssignment(title, context, courseContent);
      } else {
        content = generateMockActivity(title, context, courseContent);
      }
      
      setGeneratedContent(content);
      setIsGenerating(false);
      
      toast({
        title: t('aiGeneration.generatedTitle'),
        description: activeTab === 'qcm'
          ? t('aiGeneration.generatedQcm')
          : activeTab === 'written'
            ? t('aiGeneration.generatedWritten')
            : t('aiGeneration.generatedActivity'),
      });
    }, 2000);
  };

  const handleUseContent = () => {
    onContentGenerated(activeTab, generatedContent);
    resetForm();
    onClose();
  };

  const resetForm = () => {
    setTitle('');
    setContext('');
    setCourseContent('');
    setGeneratedContent('');
  };

  // Fonctions de génération de contenu fictif
  const generateMockQCM = (title: string, context: string, courseContent: string) => {
    const hasContent = courseContent.length > 0;
    
    return `# ${title}\n\n${context ? `${t('aiGeneration.mock.context', { context })}\n\n` : ''}
${hasContent ? `${t('aiGeneration.mock.basedOnQuestions')}\n\n` : ""}
${t('aiGeneration.mock.qcmBody')}${hasContent ? `\n\n${t('aiGeneration.mock.adapted')}` : ""}`;
  };

  const generateMockWrittenAssignment = (title: string, context: string, courseContent: string) => {
    const hasContent = courseContent.length > 0;
    
    return `# ${title}\n\n${context ? `${t('aiGeneration.mock.instructions', { context })}\n\n` : ''}
${hasContent ? `${t('aiGeneration.mock.basedOnAssignment')}\n\n` : ""}
${t('aiGeneration.mock.writtenBody')}${hasContent ? `\n\n${t('aiGeneration.mock.adapted')}` : ""}`;
  };

  const generateMockActivity = (title: string, context: string, courseContent: string) => {
    const hasContent = courseContent.length > 0;
    
    return `# ${title}\n\n${context ? `${t('aiGeneration.mock.objectives', { context })}\n\n` : ''}
${hasContent ? `${t('aiGeneration.mock.basedOnActivity')}\n\n` : ""}
${t('aiGeneration.mock.activityBody')}${hasContent ? `\n\n${t('aiGeneration.mock.adapted')}` : ""}`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-blue-500" />
            {t('aiGeneration.title')}
          </DialogTitle>
          <DialogDescription>
            {t('aiGeneration.description')}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="qcm" value={activeTab} onValueChange={(v) => setActiveTab(v as GenerationType)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="qcm" className="flex items-center gap-1">
              <CheckSquare className="h-4 w-4" />
              {t('aiGeneration.tabQcm')}
            </TabsTrigger>
            <TabsTrigger value="written" className="flex items-center gap-1">
              <FileText className="h-4 w-4" />
              {t('aiGeneration.tabWritten')}
            </TabsTrigger>
            <TabsTrigger value="activity" className="flex items-center gap-1">
              <Sparkles className="h-4 w-4" />
              {t('aiGeneration.tabActivity')}
            </TabsTrigger>
          </TabsList>

          {['qcm', 'written', 'activity'].map((type) => (
            <TabsContent key={type} value={type} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor={`title-${type}`}>{t('aiGeneration.titleLabel')}<span className="text-red-500">*</span></Label>
                <Input
                  id={`title-${type}`}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={prompts[type as GenerationType].placeholder}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor={`context-${type}`}>{prompts[type as GenerationType].contextLabel}</Label>
                <Textarea
                  id={`context-${type}`}
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  placeholder={prompts[type as GenerationType].contextPlaceholder}
                  rows={2}
                />
              </div>
              
              <Separator />
              
              <div className="space-y-2">
                <div className="flex items-center">
                  <BookOpen className="h-4 w-4 mr-2 text-muted-foreground" />
                  <Label htmlFor={`course-content-${type}`}>{t('aiGeneration.courseSupport')}</Label>
                </div>
                <p className="text-sm text-muted-foreground">
                  {t('aiGeneration.courseSupportHint')}
                </p>
                <Textarea
                  id={`course-content-${type}`}
                  value={courseContent}
                  onChange={(e) => setCourseContent(e.target.value)}
                  placeholder={t('aiGeneration.courseSupportPlaceholder')}
                  rows={5}
                />
              </div>
              
              {generatedContent && (
                <div className="border rounded-md p-4 bg-slate-50">
                  <Label className="mb-2 block">{t('aiGeneration.generatedLabel')}</Label>
                  <div className="bg-white border rounded-md p-3 whitespace-pre-wrap max-h-[300px] overflow-y-auto text-sm">
                    {generatedContent}
                  </div>
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>

        <DialogFooter className="flex flex-col sm:flex-row sm:justify-between gap-2">
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              {tCommon('actions.cancel')}
            </Button>
            <Button 
              onClick={handleGenerate} 
              disabled={isGenerating || !title}
              className="gap-2"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('aiGeneration.generating')}
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  {t('aiGeneration.generate')}
                </>
              )}
            </Button>
          </div>
          
          {generatedContent && (
            <Button onClick={handleUseContent}>
              {t('aiGeneration.useContent')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AIGenerationDialog;
