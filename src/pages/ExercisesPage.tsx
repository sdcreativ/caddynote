import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Search, 
  Filter, 
  BookOpen, 
  Trophy, 
  Clock, 
  TrendingUp,
  Star,
  Target
} from "lucide-react";
import { useStrkAuth } from "@/hooks/useStrkAuth";
import { useExercises } from "@/hooks/useExercises";
import { ExerciseCard } from "@/components/exercises/ExerciseCard";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import { useTranslation } from "react-i18next";

export default function ExercisesPage() {
  const { user } = useStrkAuth();
  const { t } = useTranslation("exercises");
  const navigate = useNavigate();
  const { exercises, loading, error } = useExercises();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedType, setSelectedType] = useState<string>("all");

  // Filtrer les exercices
  const filteredExercises = exercises.filter(exercise => {
    const matchesSearch = exercise.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         exercise.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = selectedType === "all" || exercise.exercise_type === selectedType;
    return matchesSearch && matchesType;
  });

  // Grouper les exercices par statut
  const groupedExercises = {
    assigned: filteredExercises.filter(ex => !ex.completed && !ex.overdue),
    overdue: filteredExercises.filter(ex => ex.overdue && !ex.completed),
    completed: filteredExercises.filter(ex => ex.completed),
    practice: filteredExercises.filter(ex => ex.exercise_type === 'practice'),
  };

  const handleStartExercise = (exerciseId: string) => {
    navigate(`/exercises/${exerciseId}`);
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="text-center py-8">
            <p className="text-red-600">{t("error", { message: error })}</p>
          </CardContent>
        </Card>
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
            {t("title")}
          </h1>
          <p className="text-muted-foreground mt-2">
            {t("subtitle")}
          </p>
        </div>
      </div>

      {/* Statistiques rapides */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-blue-500" />
              <div>
                <div className="text-2xl font-bold">{groupedExercises.assigned.length}</div>
                <div className="text-sm text-muted-foreground">{t("todo")}</div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-red-500" />
              <div>
                <div className="text-2xl font-bold">{groupedExercises.overdue.length}</div>
                <div className="text-sm text-muted-foreground">{t("overdue")}</div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-green-500" />
              <div>
                <div className="text-2xl font-bold">{groupedExercises.completed.length}</div>
                <div className="text-sm text-muted-foreground">{t("completed")}</div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Star className="h-5 w-5 text-purple-500" />
              <div>
                <div className="text-2xl font-bold">{groupedExercises.practice.length}</div>
                <div className="text-sm text-muted-foreground">{t("practice")}</div>
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
                  placeholder={t("searchPlaceholder")}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <div className="flex gap-2">
              {["all", "quiz", "homework", "assignment", "practice"].map((type) => (
                <Button
                  key={type}
                  variant={selectedType === type ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedType(type)}
                >
                  {type === "all" ? t("all") : type}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Contenu principal */}
      <Tabs defaultValue="assigned" className="space-y-4">
        <div className="w-full min-w-0 overflow-x-auto pb-1">
          <TabsList className="inline-flex h-auto min-w-max w-max justify-start">
            <TabsTrigger value="assigned" className="shrink-0 gap-2">
              <Target className="hidden h-4 w-4 sm:inline" />
              {t("tabTodo", { count: groupedExercises.assigned.length })}
            </TabsTrigger>
            <TabsTrigger value="overdue" className="shrink-0 gap-2">
              <Clock className="hidden h-4 w-4 sm:inline" />
              {t("tabOverdue", { count: groupedExercises.overdue.length })}
            </TabsTrigger>
            <TabsTrigger value="completed" className="shrink-0 gap-2">
              <Trophy className="hidden h-4 w-4 sm:inline" />
              {t("tabCompleted", { count: groupedExercises.completed.length })}
            </TabsTrigger>
            <TabsTrigger value="practice" className="shrink-0 gap-2">
              <Star className="hidden h-4 w-4 sm:inline" />
              {t("tabPractice", { count: groupedExercises.practice.length })}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="assigned" className="space-y-4">
          {groupedExercises.assigned.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {groupedExercises.assigned.map((exercise) => (
                <ExerciseCard
                  key={exercise.id}
                  exercise={exercise}
                  onStart={() => handleStartExercise(exercise.id)}
                  isStudent={true}
                />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="text-center py-12">
                <Target className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">{t("emptyTodoTitle")}</h3>
                <p className="text-muted-foreground">
                  {t("emptyTodoBody")}
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="overdue" className="space-y-4">
          {groupedExercises.overdue.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {groupedExercises.overdue.map((exercise) => (
                <ExerciseCard
                  key={exercise.id}
                  exercise={exercise}
                  onStart={() => handleStartExercise(exercise.id)}
                  isStudent={true}
                />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="text-center py-12">
                <Clock className="h-12 w-12 text-green-500 mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">{t("emptyOverdueTitle")}</h3>
                <p className="text-muted-foreground">
                  {t("emptyOverdueBody")}
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="completed" className="space-y-4">
          {groupedExercises.completed.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {groupedExercises.completed.map((exercise) => (
                <ExerciseCard
                  key={exercise.id}
                  exercise={exercise}
                  onStart={() => handleStartExercise(exercise.id)}
                  isStudent={true}
                />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="text-center py-12">
                <Trophy className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">{t("emptyCompletedTitle")}</h3>
                <p className="text-muted-foreground">
                  {t("emptyCompletedBody")}
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="practice" className="space-y-4">
          {groupedExercises.practice.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {groupedExercises.practice.map((exercise) => (
                <ExerciseCard
                  key={exercise.id}
                  exercise={exercise}
                  onStart={() => handleStartExercise(exercise.id)}
                  isStudent={true}
                />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="text-center py-12">
                <Star className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">{t("emptyPracticeTitle")}</h3>
                <p className="text-muted-foreground">
                  {t("emptyPracticeBody")}
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}