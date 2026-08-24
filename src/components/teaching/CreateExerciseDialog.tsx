import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Calendar as CalendarIcon, 
  Plus, 
  X, 
  Timer, 
  Brain,
  FileText,
  Target,
  Trophy,
  BookOpen,
  Clock,
  Users,
  Eye,
  EyeOff
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { StrkExercise, ExerciseType, QuestionType } from '@/types/exercises';
import { useStrkAuth } from '@/hooks/useStrkAuth';
import { AIExerciseGenerator } from '@/components/exercises/AIExerciseGenerator';
import { useTranslation } from 'react-i18next';
import { tCommon } from '@/i18n/config';
import LoadingSpinner from '@/components/common/LoadingSpinner';

interface CreateExerciseDialogProps {
  isOpen: boolean;
  onClose: () => void;
  // Bug réel corrigé (module IA, §4.16) : les questions saisies (ou générées
  // par l'IA) étaient collectées ici sans jamais être transmises au parent —
  // désormais un second paramètre, à persister via `POST /exercises/:id/
  // questions` après la création de l'exercice.
  onExerciseCreated: (exercise: Partial<StrkExercise>, questions: Question[]) => void;
  /** Mode édition : préremplit le formulaire et appelle onExerciseUpdated à la sauvegarde. */
  exerciseToEdit?: StrkExercise | null;
  initialQuestions?: Question[];
  questionsLoading?: boolean;
  onExerciseUpdated?: (exerciseId: string, exercise: Partial<StrkExercise>, questions: Question[]) => void;
}

export interface Question {
  id: string;
  question_text: string;
  question_type: QuestionType;
  points: number;
  options: string[];
  correct_answer: string;
  explanation?: string;
}

const CreateExerciseDialog = ({
  isOpen,
  onClose,
  onExerciseCreated,
  exerciseToEdit = null,
  initialQuestions,
  questionsLoading = false,
  onExerciseUpdated,
}: CreateExerciseDialogProps) => {
  const { toast } = useToast();
  const { t } = useTranslation('teaching');
  const { user } = useStrkAuth();
  const isEditMode = !!exerciseToEdit;

  // États pour l'exercice
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [exerciseType, setExerciseType] = useState<ExerciseType>('quiz');
  const [difficultyLevel, setDifficultyLevel] = useState([3]);
  const [timeLimit, setTimeLimit] = useState<number | null>(null);
  const [maxAttempts, setMaxAttempts] = useState<number>(1);
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined);
  const [points, setPoints] = useState<number>(10);
  const [isPublished, setIsPublished] = useState(false);
  const [subject, setSubject] = useState('');

  // États pour les questions
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<Partial<Question>>({
    question_text: '',
    question_type: 'multiple_choice',
    points: 1,
    options: ['', '', '', ''],
    correct_answer: '',
    explanation: ''
  });

  const exerciseTypes = [
    { value: 'quiz', label: t('createExercise.types.quiz'), icon: Brain, description: t('createExercise.types.quizDesc') },
    { value: 'homework', label: t('createExercise.types.homework'), icon: FileText, description: t('createExercise.types.homeworkDesc') },
    { value: 'assignment', label: t('createExercise.types.assignment'), icon: Target, description: t('createExercise.types.assignmentDesc') },
    { value: 'practice', label: t('createExercise.types.practice'), icon: Trophy, description: t('createExercise.types.practiceDesc') }
  ];

  const questionTypes = [
    { value: 'multiple_choice', label: t('createExercise.questionTypes.multiple_choice') },
    { value: 'true_false', label: t('createExercise.questionTypes.true_false') },
    { value: 'open_text', label: t('createExercise.questionTypes.open_text') },
    { value: 'numeric', label: t('createExercise.questionTypes.numeric') }
  ];

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setExerciseType('quiz');
    setDifficultyLevel([3]);
    setTimeLimit(null);
    setMaxAttempts(1);
    setDueDate(undefined);
    setPoints(10);
    setIsPublished(false);
    setSubject('');
    setQuestions([]);
    setCurrentQuestion({
      question_text: '',
      question_type: 'multiple_choice',
      points: 1,
      options: ['', '', '', ''],
      correct_answer: '',
      explanation: ''
    });
  };

  useEffect(() => {
    if (!isOpen) return;
    if (!exerciseToEdit) {
      resetForm();
      return;
    }
    setTitle(exerciseToEdit.title || '');
    setDescription(exerciseToEdit.description || '');
    setExerciseType(exerciseToEdit.exercise_type || 'quiz');
    setDifficultyLevel([exerciseToEdit.difficulty_level || 3]);
    setTimeLimit(exerciseToEdit.time_limit ?? null);
    setMaxAttempts(exerciseToEdit.max_attempts || 1);
    setDueDate(exerciseToEdit.due_date ? new Date(exerciseToEdit.due_date) : undefined);
    setPoints(exerciseToEdit.points || 10);
    setIsPublished(!!exerciseToEdit.is_published);
    setSubject(exerciseToEdit.subject || '');
  }, [isOpen, exerciseToEdit]);

  useEffect(() => {
    if (!isOpen || !exerciseToEdit) return;
    if (initialQuestions) {
      setQuestions(initialQuestions);
    }
  }, [isOpen, exerciseToEdit, initialQuestions]);

  const buildExercisePayload = (): Partial<StrkExercise> => ({
    title,
    description,
    institution_id: user?.institutionId || '',
    teacher_id: user?.id || '',
    exercise_type: exerciseType,
    difficulty_level: difficultyLevel[0],
    time_limit: timeLimit ?? undefined,
    max_attempts: maxAttempts,
    due_date: dueDate?.toISOString(),
    is_published: isPublished,
    points,
    subject
  });

  const handleCreateExercise = () => {
    if (!title) {
      toast({
        title: tCommon('status.error'),
        description: t('createExercise.titleRequired'),
        variant: "destructive",
      });
      return;
    }

    if (questions.length === 0) {
      toast({
        title: tCommon('status.error'), 
        description: t('createExercise.questionsRequired'),
        variant: "destructive",
      });
      return;
    }

    if (isEditMode && exerciseToEdit && onExerciseUpdated) {
      onExerciseUpdated(exerciseToEdit.id, buildExercisePayload(), questions);
      toast({
        title: tCommon('status.success'),
        description: t('createExercise.updatedSuccess'),
      });
      onClose();
      return;
    }

    onExerciseCreated(buildExercisePayload(), questions);

    toast({
      title: tCommon('status.success'),
      description: isPublished ? t('createExercise.publishedSuccess') : t('createExercise.draftSuccess'),
    });

    resetForm();
    onClose();
  };

  const addQuestion = () => {
    if (!currentQuestion.question_text) {
      toast({
        title: tCommon('status.error'),
        description: t('createExercise.questionTextRequired'),
        variant: "destructive",
      });
      return;
    }

    const newQuestion: Question = {
      id: Date.now().toString(),
      question_text: currentQuestion.question_text!,
      question_type: currentQuestion.question_type!,
      points: currentQuestion.points || 1,
      options: currentQuestion.options || [],
      correct_answer: currentQuestion.correct_answer!,
      explanation: currentQuestion.explanation
    };

    setQuestions([...questions, newQuestion]);
    setCurrentQuestion({
      question_text: '',
      question_type: 'multiple_choice',
      points: 1,
      options: ['', '', '', ''],
      correct_answer: '',
      explanation: ''
    });

    toast({
      title: t('createExercise.questionAddedTitle'),
      description: t('createExercise.questionAddedBody')
    });
  };

  const removeQuestion = (id: string) => {
    setQuestions(questions.filter(q => q.id !== id));
  };

  const updateCurrentQuestionOption = (index: number, value: string) => {
    const newOptions = [...(currentQuestion.options || ['', '', '', ''])];
    newOptions[index] = value;
    setCurrentQuestion({ ...currentQuestion, options: newOptions });
  };

  // Module IA (§4.16) : `AIExerciseGenerator` était un composant complet,
  // testé côté backend, mais rendu par aucune page — branché ici. Les
  // questions générées rejoignent le même état local que la saisie manuelle
  // (mêmes revue/édition/suppression possibles avant enregistrement) plutôt
  // que d'être envoyées directement, l'IA proposant un brouillon à valider,
  // pas un contenu publié sans relecture.
  const handleAIGenerated = (
    result: { title?: string; description?: string; questions?: Array<Record<string, any>> },
    formData: { subject: string; difficulty: number; exerciseType: string }
  ) => {
    if (result.title) setTitle(result.title);
    if (result.description) setDescription(result.description);
    if (formData.subject) setSubject(formData.subject);
    if (formData.difficulty) setDifficultyLevel([formData.difficulty]);
    if (formData.exerciseType) setExerciseType(formData.exerciseType as ExerciseType);

    const generated: Question[] = (result.questions ?? []).map((q, index) => ({
      id: `ai-${Date.now()}-${index}`,
      question_text: q.questionText ?? '',
      question_type: (q.questionType ?? 'multiple_choice') as QuestionType,
      points: q.points ?? 1,
      options: q.options ?? [],
      correct_answer: q.correctAnswer ?? '',
      explanation: q.explanation,
    }));
    setQuestions((prev) => [...prev, ...generated]);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditMode ? t('createExercise.editTitle') : t('createExercise.title')}
          </DialogTitle>
          <DialogDescription>
            {isEditMode ? t('createExercise.editDescription') : t('createExercise.description')}
          </DialogDescription>
        </DialogHeader>

        {questionsLoading ? (
          <div className="py-12">
            <LoadingSpinner />
          </div>
        ) : (
        <Tabs defaultValue="general" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="general">{t('createExercise.tabGeneral')}</TabsTrigger>
            <TabsTrigger value="questions">{t('createExercise.tabQuestions', { count: questions.length })}</TabsTrigger>
            <TabsTrigger value="settings">{t('createExercise.tabSettings')}</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-4">
            <AIExerciseGenerator onExerciseGenerated={handleAIGenerated} />

            <div className="space-y-2">
              <Label htmlFor="title">{t('createExercise.titleLabel')}<span className="text-red-500">*</span></Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('createExercise.titlePlaceholder')}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">{t('createExercise.desc')}</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('createExercise.descPlaceholder')}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label>{t('createExercise.type')}</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {exerciseTypes.map((type) => {
                  const Icon = type.icon;
                  return (
                    <Card 
                      key={type.value}
                      className={cn(
                        "cursor-pointer transition-colors",
                        exerciseType === type.value ? "ring-2 ring-primary" : ""
                      )}
                      onClick={() => setExerciseType(type.value as ExerciseType)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                          <Icon className="h-5 w-5 text-primary" />
                          <div>
                            <div className="font-medium">{type.label}</div>
                            <div className="text-sm text-muted-foreground">{type.description}</div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="subject">{t('createExercise.subject')}</Label>
                <Input
                  id="subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder={t('createExercise.subjectPlaceholder')}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="points">{t('createExercise.totalPoints')}</Label>
                <Input
                  id="points"
                  type="number"
                  min="1"
                  value={points}
                  onChange={(e) => setPoints(parseInt(e.target.value))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('createExercise.difficulty', { level: difficultyLevel[0] })}</Label>
              <Slider
                value={difficultyLevel}
                onValueChange={setDifficultyLevel}
                max={5}
                min={1}
                step={1}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{t('createExercise.veryEasy')}</span>
                <span>{t('createExercise.easy')}</span>
                <span>{t('createExercise.medium')}</span>
                <span>{t('createExercise.hard')}</span>
                <span>{t('createExercise.veryHard')}</span>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="questions" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t('createExercise.addQuestion')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>{t('createExercise.questionText')}</Label>
                  <Textarea
                    value={currentQuestion.question_text}
                    onChange={(e) => setCurrentQuestion({ ...currentQuestion, question_text: e.target.value })}
                    placeholder={t('createExercise.questionPlaceholder')}
                    rows={2}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t('createExercise.questionType')}</Label>
                    <Select 
                      value={currentQuestion.question_type} 
                      onValueChange={(value) => setCurrentQuestion({ ...currentQuestion, question_type: value as QuestionType })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {questionTypes.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>{t('createExercise.points')}</Label>
                    <Input
                      type="number"
                      min="1"
                      value={currentQuestion.points}
                      onChange={(e) => setCurrentQuestion({ ...currentQuestion, points: parseInt(e.target.value) })}
                    />
                  </div>
                </div>

                {(currentQuestion.question_type === 'multiple_choice' || currentQuestion.question_type === 'true_false') && (
                  <div className="space-y-2">
                    <Label>{t('createExercise.options')}</Label>
                    {currentQuestion.question_type === 'true_false' ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="radio"
                            id="true"
                            name="tf_answer"
                            value="true"
                            checked={currentQuestion.correct_answer === 'true'}
                            onChange={(e) => setCurrentQuestion({ ...currentQuestion, correct_answer: e.target.value })}
                          />
                          <Label htmlFor="true">{t('createExercise.true')}</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="radio"
                            id="false"
                            name="tf_answer"
                            value="false"
                            checked={currentQuestion.correct_answer === 'false'}
                            onChange={(e) => setCurrentQuestion({ ...currentQuestion, correct_answer: e.target.value })}
                          />
                          <Label htmlFor="false">{t('createExercise.false')}</Label>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {(currentQuestion.options || ['', '', '', '']).map((option, index) => (
                          <div key={index} className="flex items-center gap-2">
                            <input
                              type="radio"
                              id={`option_${index}`}
                              name="mc_answer"
                              value={option}
                              checked={currentQuestion.correct_answer === option}
                              onChange={(e) => setCurrentQuestion({ ...currentQuestion, correct_answer: e.target.value })}
                            />
                            <Input
                              placeholder={t('createExercise.optionN', { n: index + 1 })}
                              value={option}
                              onChange={(e) => updateCurrentQuestionOption(index, e.target.value)}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {currentQuestion.question_type === 'numeric' && (
                  <div className="space-y-2">
                    <Label>{t('createExercise.numericAnswer')}</Label>
                    <Input
                      type="number"
                      placeholder={t('createExercise.numericPlaceholder')}
                      value={currentQuestion.correct_answer}
                      onChange={(e) => setCurrentQuestion({ ...currentQuestion, correct_answer: e.target.value })}
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label>{t('createExercise.explanation')}</Label>
                  <Textarea
                    value={currentQuestion.explanation}
                    onChange={(e) => setCurrentQuestion({ ...currentQuestion, explanation: e.target.value })}
                    placeholder={t('createExercise.explanationPlaceholder')}
                    rows={2}
                  />
                </div>

                <Button onClick={addQuestion} className="w-full">
                  <Plus className="h-4 w-4 mr-2" />
                  {t('createExercise.addThisQuestion')}
                </Button>
              </CardContent>
            </Card>

            {questions.length > 0 && (
              <div className="space-y-2">
                <Label>{t('createExercise.addedQuestions', { count: questions.length })}</Label>
                <div className="space-y-2">
                  {questions.map((question, index) => (
                    <Card key={question.id}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="font-medium">
                              {index + 1}. {question.question_text}
                            </div>
                            <div className="text-sm text-muted-foreground mt-1">
                              {t('createExercise.questionMeta', { type: questionTypes.find(typ => typ.value === question.question_type)?.label, points: question.points })}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeQuestion(question.id)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="settings" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="timeLimit">{t('createExercise.timeLimit')}</Label>
                <Input
                  id="timeLimit"
                  type="number"
                  min="1"
                  placeholder={t('createExercise.noLimit')}
                  value={timeLimit || ''}
                  onChange={(e) => setTimeLimit(e.target.value ? parseInt(e.target.value) : null)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="maxAttempts">{t('createExercise.maxAttempts')}</Label>
                <Input
                  id="maxAttempts"
                  type="number"
                  min="1"
                  value={maxAttempts}
                  onChange={(e) => setMaxAttempts(parseInt(e.target.value))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="dueDate">{t('createExercise.dueDate')}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    id="dueDate"
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !dueDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dueDate ? format(dueDate, "PPP", { locale: fr }) : t('createExercise.selectDate')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={dueDate}
                    onSelect={setDueDate}
                    initialFocus
                    disabled={(date) => date < new Date()}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="published"
                checked={isPublished}
                onCheckedChange={setIsPublished}
              />
              <Label htmlFor="published" className="cursor-pointer flex items-center gap-2">
                {isPublished ? (
                  <>
                    <Eye className="h-4 w-4 text-green-500" />
                    {t('createExercise.publishNow')}
                  </>
                ) : (
                  <>
                    <EyeOff className="h-4 w-4 text-gray-500" />
                    {t('createExercise.keepDraft')}
                  </>
                )}
              </Label>
            </div>
          </TabsContent>
        </Tabs>
        )}

        <DialogFooter>
          <div className="flex justify-between w-full">
            <div className="text-sm text-muted-foreground">
              <span className="text-red-500">*</span> {t('createExercise.requiredFields')}
            </div>
            <div className="flex space-x-2">
              <Button variant="outline" onClick={onClose}>
                {tCommon('actions.cancel')}
              </Button>
              <Button 
                onClick={handleCreateExercise}
                disabled={questionsLoading || !title || questions.length === 0}
              >
                {isEditMode
                  ? tCommon('actions.save')
                  : isPublished
                    ? t('createExercise.publish')
                    : tCommon('actions.save')}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreateExerciseDialog;