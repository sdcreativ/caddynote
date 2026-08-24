import { useCallback, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStrkAuth } from "@/hooks/useStrkAuth";
import { useToast } from "@/hooks/use-toast";
import { useExercises } from "@/hooks/useExercises";
import { StrkExercise, QuestionType } from "@/types/exercises";
import { 
  BookOpen, 
  Users, 
  Clock, 
  CheckCircle, 
  Search, 
  Plus,
  Brain,
  FileText,
  Target,
  Trophy
} from "lucide-react";
import CreateExerciseDialog, { type Question } from "@/components/teaching/CreateExerciseDialog";
import ExerciseResultsDialog from "@/components/teaching/ExerciseResultsDialog";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import { useTranslation } from "react-i18next";
import { tCommon } from "@/i18n/config";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const TeacherExercisesPage = () => {
  const { user } = useStrkAuth();
  const { toast } = useToast();
  const { t } = useTranslation("exercises");
  const {
    exercises,
    loading,
    createExercise,
    addQuestion,
    fetchQuestions,
    updateQuestion,
    deleteQuestion,
    fetchExerciseAttempts,
    fetchExercises,
    publishExercise,
    updateExercise,
  } = useExercises();
  const [searchQuery, setSearchQuery] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<string>("all");
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [editingExercise, setEditingExercise] = useState<StrkExercise | null>(null);
  const [editQuestions, setEditQuestions] = useState<Question[]>([]);
  const [editQuestionsLoading, setEditQuestionsLoading] = useState(false);
  const [resultsExercise, setResultsExercise] = useState<StrkExercise | null>(null);

  const handleTogglePublish = async (exercise: StrkExercise) => {
    setPublishingId(exercise.id);
    try {
      if (exercise.is_published) {
        await updateExercise(exercise.id, { is_published: false });
        toast({ title: t("teacher.unpublishedSuccess") });
      } else {
        await publishExercise(exercise.id);
        toast({ title: t("teacher.publishedSuccess") });
      }
    } catch (error) {
      console.error("Erreur publication exercice:", error);
      toast({
        title: tCommon("status.error"),
        description: t("teacher.publishError"),
        variant: "destructive",
      });
    } finally {
      setPublishingId(null);
    }
  };

  // Filtrer les exercices créés par l'enseignant
  const teacherExercises = exercises.filter(exercise => exercise.teacher_id === user?.id);

  const filteredExercises = teacherExercises.filter(exercise =>
    (exercise.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
     exercise.description?.toLowerCase().includes(searchQuery.toLowerCase())) &&
    (selectedType === "all" || exercise.exercise_type === selectedType)
  );

  const exerciseTypes = [
    { value: "all", label: t("teacher.types.all"), icon: BookOpen },
    { value: "quiz", label: t("teacher.types.quiz"), icon: Brain },
    { value: "homework", label: t("teacher.types.homework"), icon: FileText },
    { value: "assignment", label: t("teacher.types.assignment"), icon: Target },
    { value: "practice", label: t("teacher.types.practice"), icon: Trophy }
  ];

  // Bug réel corrigé (module IA, §4.16) : les questions saisies dans le
  // dialogue (manuellement ou via le générateur IA) n'étaient jusqu'ici
  // jamais envoyées au serveur — l'exercice était créé sans elles, en
  // silence. Persistées ici une à une (même principe que l'import CSV
  // ELV-005 : une question en échec ne bloque pas les suivantes, mais
  // l'échec est signalé plutôt que caché).
  const handleCreateExercise = async (exerciseData: Partial<StrkExercise>, questions: Question[]) => {
    try {
      const exercise = await createExercise(exerciseData);
      let failed = 0;
      for (let i = 0; i < questions.length; i++) {
        try {
          await addQuestion(exercise.id, { ...questions[i], question_order: i });
        } catch (err) {
          console.error('Erreur lors de l\'ajout de la question:', err);
          failed++;
        }
      }
      if (failed > 0) {
        toast({
          title: t('teacher.incompleteTitle'),
          description: t('teacher.incompleteBody', { failed, total: questions.length }),
          variant: 'destructive',
        });
      }
      await fetchExercises();
      setCreateDialogOpen(false);
    } catch (error) {
      console.error('Erreur lors de la création de l\'exercice:', error);
      toast({
        title: tCommon('status.error'),
        description: t('teacher.createError'),
        variant: 'destructive',
      });
    }
  };

  const handleOpenEdit = async (exercise: StrkExercise) => {
    setEditingExercise(exercise);
    setEditQuestions([]);
    setEditQuestionsLoading(true);
    try {
      const loaded = await fetchQuestions(exercise.id);
      setEditQuestions(
        loaded.map((q) => ({
          id: q.id,
          question_text: q.question_text,
          question_type: q.question_type as QuestionType,
          points: q.points,
          options: q.options,
          correct_answer: q.correct_answer,
          explanation: q.explanation,
        }))
      );
    } catch (error) {
      console.error('Erreur chargement questions:', error);
      toast({
        title: tCommon('status.error'),
        description: t('teacher.editLoadError'),
        variant: 'destructive',
      });
      setEditingExercise(null);
    } finally {
      setEditQuestionsLoading(false);
    }
  };

  const handleUpdateExercise = async (
    exerciseId: string,
    exerciseData: Partial<StrkExercise>,
    questions: Question[]
  ) => {
    try {
      await updateExercise(exerciseId, exerciseData);
      const existing = await fetchQuestions(exerciseId);
      const existingIds = new Set(existing.map((q) => q.id));
      const keptIds = new Set(questions.map((q) => q.id).filter((id) => UUID_RE.test(id)));

      for (const id of existingIds) {
        if (!keptIds.has(id)) {
          await deleteQuestion(id);
        }
      }

      let failed = 0;
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        try {
          if (UUID_RE.test(q.id) && existingIds.has(q.id)) {
            await updateQuestion(q.id, { ...q, question_order: i });
          } else {
            await addQuestion(exerciseId, { ...q, question_order: i });
          }
        } catch (err) {
          console.error('Erreur synchronisation question:', err);
          failed++;
        }
      }

      if (failed > 0) {
        toast({
          title: t('teacher.incompleteTitle'),
          description: t('teacher.incompleteBody', { failed, total: questions.length }),
          variant: 'destructive',
        });
      }

      await fetchExercises();
      setEditingExercise(null);
      setEditQuestions([]);
    } catch (error) {
      console.error('Erreur mise à jour exercice:', error);
      toast({
        title: tCommon('status.error'),
        description: t('teacher.editError'),
        variant: 'destructive',
      });
    }
  };

  const loadAttempts = useCallback(
    (exerciseId: string) => fetchExerciseAttempts(exerciseId),
    [fetchExerciseAttempts]
  );

  // Statistiques
  const stats = {
    total: filteredExercises.length,
    published: filteredExercises.filter(ex => ex.is_published).length,
    draft: filteredExercises.filter(ex => !ex.is_published).length,
    overdue: filteredExercises.filter(ex => ex.due_date && new Date(ex.due_date) < new Date()).length
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
            <BookOpen className="h-8 w-8 text-primary" />
            {t("teacher.title")}
          </h1>
          <p className="text-muted-foreground mt-2">
            {t("teacher.subtitle")}
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)} size="lg">
          <Plus className="h-5 w-5 mr-2" />
          {t("teacher.create")}
        </Button>
      </div>

      {/* Statistiques */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-blue-500" />
              <div>
                <div className="text-2xl font-bold">{stats.total}</div>
                <div className="text-sm text-muted-foreground">{t("teacher.total")}</div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <div>
                <div className="text-2xl font-bold">{stats.published}</div>
                <div className="text-sm text-muted-foreground">{t("teacher.published")}</div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-orange-500" />
              <div>
                <div className="text-2xl font-bold">{stats.draft}</div>
                <div className="text-sm text-muted-foreground">{t("teacher.drafts")}</div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-red-500" />
              <div>
                <div className="text-2xl font-bold">{stats.overdue}</div>
                <div className="text-sm text-muted-foreground">{t("teacher.overdue")}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtres et recherche */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t("teacher.searchPlaceholder")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <div className="flex gap-2 flex-wrap">
              {exerciseTypes.map((type) => {
                const Icon = type.icon;
                return (
                  <Button
                    key={type.value}
                    variant={selectedType === type.value ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedType(type.value)}
                    className="flex items-center gap-2"
                  >
                    <Icon className="h-4 w-4" />
                    {type.label}
                  </Button>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Liste des exercices */}
      <div className="grid gap-4">
        {filteredExercises.length > 0 ? (
          filteredExercises.map((exercise) => (
            <ExerciseCard
              key={exercise.id}
              exercise={exercise}
              publishing={publishingId === exercise.id}
              onTogglePublish={() => handleTogglePublish(exercise)}
              onEdit={() => void handleOpenEdit(exercise)}
              onViewResults={() => setResultsExercise(exercise)}
            />
          ))
        ) : (
          <Card>
            <CardContent className="text-center py-12">
              <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">
                {searchQuery ? t("teacher.emptySearchTitle") : t("teacher.emptyNoneTitle")}
              </h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery 
                  ? t("teacher.emptySearchBody") 
                  : t("teacher.emptyNoneBody")
                }
              </p>
              {!searchQuery && (
                <Button onClick={() => setCreateDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  {t("teacher.create")}
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Dialog de création */}
      <CreateExerciseDialog
        isOpen={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        onExerciseCreated={handleCreateExercise}
      />

      <CreateExerciseDialog
        isOpen={!!editingExercise}
        onClose={() => {
          setEditingExercise(null);
          setEditQuestions([]);
        }}
        onExerciseCreated={handleCreateExercise}
        exerciseToEdit={editingExercise}
        initialQuestions={editQuestions}
        questionsLoading={editQuestionsLoading}
        onExerciseUpdated={handleUpdateExercise}
      />

      <ExerciseResultsDialog
        isOpen={!!resultsExercise}
        onClose={() => setResultsExercise(null)}
        exercise={resultsExercise}
        loadAttempts={loadAttempts}
      />
    </div>
  );
};

interface ExerciseCardProps {
  exercise: StrkExercise;
  publishing?: boolean;
  onTogglePublish: () => void;
  onEdit: () => void;
  onViewResults: () => void;
}

const ExerciseCard = ({
  exercise,
  publishing = false,
  onTogglePublish,
  onEdit,
  onViewResults,
}: ExerciseCardProps) => {
  const { t } = useTranslation("exercises");
  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'quiz': return Brain;
      case 'homework': return FileText;
      case 'assignment': return Target;
      case 'practice': return Trophy;
      default: return BookOpen;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'quiz': return 'bg-purple-100 text-purple-700';
      case 'homework': return 'bg-blue-100 text-blue-700';
      case 'assignment': return 'bg-green-100 text-green-700';
      case 'practice': return 'bg-orange-100 text-orange-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const TypeIcon = getTypeIcon(exercise.exercise_type);
  const isOverdue = exercise.due_date && new Date(exercise.due_date) < new Date();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <TypeIcon className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-lg">{exercise.title}</CardTitle>
              <CardDescription>{exercise.description}</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!exercise.is_published && (
              <Badge variant="secondary">{t("teacher.draft")}</Badge>
            )}
            {isOverdue && (
              <Badge variant="destructive">{t("teacher.overdueBadge")}</Badge>
            )}
            <Badge className={getTypeColor(exercise.exercise_type)}>
              {exercise.exercise_type}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-muted-foreground" />
            <span>{t("teacher.points", { count: exercise.points })}</span>
          </div>
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-muted-foreground" />
            <span>{t("teacher.level", { level: exercise.difficulty_level })}</span>
          </div>
          {exercise.time_limit && (
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span>{t("teacher.minutes", { count: exercise.time_limit })}</span>
            </div>
          )}
          {exercise.max_attempts && (
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span>{t("teacher.maxAttempts", { count: exercise.max_attempts })}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {exercise.due_date && (
              <>{t("teacher.due", { date: new Date(exercise.due_date).toLocaleDateString('fr-FR') })}</>
            )}
            {exercise.created_at && (
              <>{t("teacher.created", { date: new Date(exercise.created_at).toLocaleDateString('fr-FR') })}</>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onEdit}>
              {tCommon("actions.edit")}
            </Button>
            <Button variant="outline" size="sm" onClick={onViewResults}>
              {t("teacher.results")}
            </Button>
            {!exercise.is_published ? (
              <Button size="sm" disabled={publishing} onClick={onTogglePublish}>
                {publishing ? t("teacher.publishing") : t("teacher.publish")}
              </Button>
            ) : (
              <Button variant="secondary" size="sm" disabled={publishing} onClick={onTogglePublish}>
                {publishing ? t("teacher.unpublishing") : t("teacher.unpublish")}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default TeacherExercisesPage;
