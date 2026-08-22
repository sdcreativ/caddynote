import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { 
  Clock, 
  Users, 
  BookOpen, 
  CheckCircle, 
  XCircle, 
  Play,
  Target,
  Calendar
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";

interface ExerciseCardProps {
  exercise: any;
  progress?: any;
  onStart: () => void;
  onResume?: () => void;
  isStudent?: boolean;
}

export const ExerciseCard = ({ 
  exercise, 
  progress, 
  onStart, 
  onResume, 
  isStudent = false 
}: ExerciseCardProps) => {
  const [isHovered, setIsHovered] = useState(false);

  const getExerciseTypeIcon = (type: string) => {
    switch (type) {
      case 'quiz': return '❓';
      case 'homework': return '📝';
      case 'assignment': return '📋';
      case 'practice': return '🎯';
      default: return '📚';
    }
  };

  const getExerciseTypeColor = (type: string) => {
    switch (type) {
      case 'quiz': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'homework': return 'bg-green-100 text-green-800 border-green-200';
      case 'assignment': return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'practice': return 'bg-orange-100 text-orange-800 border-orange-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getDifficultyStars = (level: number) => {
    return '⭐'.repeat(Math.min(level, 5));
  };

  const hasStarted = progress && progress.questions_answered > 0;
  const isCompleted = progress && progress.progress_percentage >= 100;
  const isOverdue = exercise.due_date && new Date(exercise.due_date) < new Date();

  return (
    <Card 
      className={`transition-all duration-300 hover:shadow-lg hover:-translate-y-1 border-border/50 ${
        isHovered ? 'shadow-xl border-primary/20' : ''
      } ${isOverdue && !isCompleted ? 'border-red-200 bg-red-50/30' : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">{getExerciseTypeIcon(exercise.exercise_type)}</span>
              <Badge 
                variant="outline" 
                className={getExerciseTypeColor(exercise.exercise_type)}
              >
                {exercise.exercise_type}
              </Badge>
              {exercise.difficulty_level && (
                <Badge variant="outline" className="text-xs">
                  {getDifficultyStars(exercise.difficulty_level)}
                </Badge>
              )}
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">
              {exercise.title}
            </h3>
            {exercise.description && (
              <p className="text-sm text-muted-foreground line-clamp-2">
                {exercise.description}
              </p>
            )}
          </div>
          {isCompleted && (
            <CheckCircle className="h-6 w-6 text-green-500 flex-shrink-0" />
          )}
          {isOverdue && !isCompleted && (
            <XCircle className="h-6 w-6 text-red-500 flex-shrink-0" />
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Progression pour les étudiants */}
        {isStudent && progress && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Progression</span>
              <span className="font-medium">{progress.progress_percentage}%</span>
            </div>
            <Progress value={progress.progress_percentage} className="h-2" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{progress.questions_answered} questions</span>
              <span>{progress.total_questions} total</span>
            </div>
          </div>
        )}

        {/* Informations sur l'exercice */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Target className="h-4 w-4" />
            <span>{exercise.points || 100} points</span>
          </div>
          {exercise.time_limit && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>{exercise.time_limit} min</span>
            </div>
          )}
          {exercise.subject && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <BookOpen className="h-4 w-4" />
              <span>{exercise.subject}</span>
            </div>
          )}
          {exercise.max_attempts && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="h-4 w-4" />
              <span>{exercise.max_attempts} tentatives</span>
            </div>
          )}
        </div>

        {/* Date d'échéance */}
        {exercise.due_date && (
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="h-4 w-4" />
            <span className={isOverdue ? 'text-red-600 font-medium' : 'text-muted-foreground'}>
              {isOverdue ? 'Échéance dépassée' : 'Échéance'} : {' '}
              {formatDistanceToNow(new Date(exercise.due_date), { 
                addSuffix: true, 
                locale: fr 
              })}
            </span>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          {isStudent ? (
            <>
              {!hasStarted ? (
                <Button 
                  onClick={onStart} 
                  className="flex-1"
                  disabled={isOverdue && !isCompleted}
                >
                  <Play className="h-4 w-4 mr-2" />
                  Commencer
                </Button>
              ) : (
                <>
                  {!isCompleted ? (
                    <Button 
                      onClick={onResume} 
                      variant="outline" 
                      className="flex-1"
                      disabled={isOverdue}
                    >
                      Reprendre
                    </Button>
                  ) : (
                    <Button 
                      onClick={onStart} 
                      variant="secondary" 
                      className="flex-1"
                    >
                      Revoir
                    </Button>
                  )}
                </>
              )}
            </>
          ) : (
            <Button 
              onClick={onStart} 
              variant="outline" 
              className="flex-1"
            >
              Gérer
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};