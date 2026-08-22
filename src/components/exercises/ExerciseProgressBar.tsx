import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Clock, Target, Award } from "lucide-react";

interface ExerciseProgressBarProps {
  progress: number;
  questionsAnswered: number;
  totalQuestions: number;
  timeSpent?: number;
  streakCount?: number;
  score?: number;
  maxScore?: number;
}

export const ExerciseProgressBar = ({
  progress,
  questionsAnswered,
  totalQuestions,
  timeSpent = 0,
  streakCount = 0,
  score,
  maxScore,
}: ExerciseProgressBarProps) => {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getProgressColor = () => {
    if (progress >= 80) return "bg-gradient-to-r from-green-500 to-emerald-500";
    if (progress >= 60) return "bg-gradient-to-r from-blue-500 to-cyan-500";
    if (progress >= 40) return "bg-gradient-to-r from-yellow-500 to-orange-500";
    return "bg-gradient-to-r from-red-500 to-pink-500";
  };

  return (
    <div className="space-y-4 p-6 bg-card rounded-xl border border-border/50 shadow-sm">
      {/* En-tête de progression */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold text-foreground">Progression</h3>
          <p className="text-sm text-muted-foreground">
            {questionsAnswered} sur {totalQuestions} questions
          </p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-foreground">{progress}%</div>
          {score !== undefined && maxScore && (
            <div className="text-sm text-muted-foreground">
              {score}/{maxScore} pts
            </div>
          )}
        </div>
      </div>

      {/* Barre de progression animée */}
      <div className="space-y-2">
        <Progress 
          value={progress} 
          className="h-3 bg-muted"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>0%</span>
          <span>50%</span>
          <span>100%</span>
        </div>
      </div>

      {/* Statistiques */}
      <div className="grid grid-cols-3 gap-4">
        <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg">
          <Clock className="h-4 w-4 text-blue-500" />
          <div>
            <div className="text-sm font-medium">{formatTime(timeSpent)}</div>
            <div className="text-xs text-muted-foreground">Temps</div>
          </div>
        </div>

        <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg">
          <Target className="h-4 w-4 text-green-500" />
          <div>
            <div className="text-sm font-medium">{questionsAnswered}</div>
            <div className="text-xs text-muted-foreground">Réponses</div>
          </div>
        </div>

        <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg">
          <Award className="h-4 w-4 text-purple-500" />
          <div>
            <div className="text-sm font-medium">{streakCount}</div>
            <div className="text-xs text-muted-foreground">Série</div>
          </div>
        </div>
      </div>

      {/* Badges de réussite */}
      {streakCount > 0 && (
        <div className="flex flex-wrap gap-2">
          {streakCount >= 3 && (
            <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 border-yellow-200">
              🔥 Série de {streakCount}
            </Badge>
          )}
          {progress >= 50 && (
            <Badge variant="secondary" className="bg-blue-100 text-blue-800 border-blue-200">
              📚 Mi-parcours
            </Badge>
          )}
          {progress >= 100 && (
            <Badge variant="secondary" className="bg-green-100 text-green-800 border-green-200">
              🎉 Terminé !
            </Badge>
          )}
        </div>
      )}
    </div>
  );
};