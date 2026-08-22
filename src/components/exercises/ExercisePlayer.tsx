import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { 
  ChevronLeft, 
  ChevronRight, 
  Clock, 
  Send, 
  Save,
  AlertTriangle,
  Target,
  BookOpen
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { QuestionComponent } from "./QuestionComponent";
import { ExerciseProgressBar } from "./ExerciseProgressBar";
import { useExerciseProgress, useExerciseAttempts } from "@/hooks/useExercises";

interface ExercisePlayerProps {
  exercise: any;
  questions: any[];
  onComplete: (answers: Record<string, any>, score: number) => void;
  onExit: () => void;
}

export const ExercisePlayer = ({ 
  exercise, 
  questions, 
  onComplete, 
  onExit 
}: ExercisePlayerProps) => {
  const { toast } = useToast();
  const { progress, updateProgress } = useExerciseProgress(exercise.id);
  const { currentAttempt, startAttempt } = useExerciseAttempts(exercise.id);
  
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [timeSpent, setTimeSpent] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [startTime] = useState(Date.now());

  // Timer pour suivre le temps passé
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeSpent(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [startTime]);

  // Initialiser une tentative si nécessaire
  useEffect(() => {
    if (!currentAttempt) {
      startAttempt().catch(console.error);
    }
  }, [currentAttempt, startAttempt]);

  // Sauvegarder automatiquement les réponses
  useEffect(() => {
    if (currentAttempt && Object.keys(answers).length > 0) {
      saveProgress();
    }
  }, [answers, currentAttempt]);

  const currentQuestion = questions[currentQuestionIndex];
  const totalQuestions = questions.length;
  const answeredQuestions = Object.keys(answers).length;
  const progressPercentage = Math.round((answeredQuestions / totalQuestions) * 100);

  const saveProgress = async () => {
    try {
      await updateProgress({
        progress_percentage: progressPercentage,
        questions_answered: answeredQuestions,
        total_questions: totalQuestions,
        current_question_id: currentQuestion?.id,
        last_activity: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error saving progress:', error);
    }
  };

  const handleAnswerChange = (questionId: string, answer: any) => {
    setAnswers(prev => ({
      ...prev,
      [questionId]: answer
    }));
  };

  const calculateScore = () => {
    let totalScore = 0;
    let maxScore = 0;

    questions.forEach(question => {
      maxScore += question.points || 10;
      const userAnswer = answers[question.id];
      
      if (userAnswer !== undefined && userAnswer !== null) {
        // Logique de calcul du score selon le type de question
        switch (question.question_type) {
          case 'multiple_choice':
          case 'true_false':
            if (userAnswer === question.correct_answer) {
              totalScore += question.points || 10;
            }
            break;
          case 'numeric':
            if (parseFloat(userAnswer) === parseFloat(question.correct_answer)) {
              totalScore += question.points || 10;
            }
            break;
          case 'open_text':
            // Pour les questions ouvertes, on donne le score complet temporairement
            // (nécessiterait une correction manuelle en production)
            totalScore += question.points || 10;
            break;
        }
      }
    });

    return { totalScore, maxScore };
  };

  const handleSubmit = async () => {
    if (answeredQuestions < totalQuestions) {
      toast({
        title: "Exercice incomplet",
        description: `Il vous reste ${totalQuestions - answeredQuestions} question(s) à répondre.`,
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const { totalScore, maxScore } = calculateScore();
      
      await updateProgress({
        progress_percentage: 100,
        questions_answered: totalQuestions,
        total_questions: totalQuestions,
      });

      onComplete(answers, totalScore);
      
      toast({
        title: "Exercice terminé !",
        description: `Votre score : ${totalScore}/${maxScore} points`,
      });
    } catch (error) {
      console.error('Error submitting exercise:', error);
      toast({
        title: "Erreur",
        description: "Impossible de soumettre l'exercice. Veuillez réessayer.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const goToQuestion = (index: number) => {
    if (index >= 0 && index < totalQuestions) {
      setCurrentQuestionIndex(index);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!currentQuestion) {
    return (
      <Card className="max-w-2xl mx-auto">
        <CardContent className="text-center py-8">
          <AlertTriangle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">Aucune question disponible</h3>
          <p className="text-muted-foreground mb-4">
            Cet exercice ne contient aucune question.
          </p>
          <Button onClick={onExit}>Retour</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* En-tête de l'exercice */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <BookOpen className="h-6 w-6" />
                {exercise.title}
              </h1>
              <p className="text-muted-foreground mt-1">
                Question {currentQuestionIndex + 1} sur {totalQuestions}
              </p>
            </div>
            <div className="text-right space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>{formatTime(timeSpent)}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Target className="h-4 w-4" />
                <span>{exercise.points || 100} points</span>
              </div>
            </div>
          </div>
          
          {/* Barre de progression globale */}
          <div className="space-y-2">
            <Progress value={progressPercentage} className="h-2" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{answeredQuestions} répondue(s)</span>
              <span>{progressPercentage}% terminé</span>
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Zone principale - Question */}
        <div className="lg:col-span-2 space-y-4">
          <QuestionComponent
            question={currentQuestion}
            answer={answers[currentQuestion.id]}
            onAnswerChange={(answer) => handleAnswerChange(currentQuestion.id, answer)}
          />

          {/* Navigation entre questions */}
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              onClick={() => goToQuestion(currentQuestionIndex - 1)}
              disabled={currentQuestionIndex === 0}
            >
              <ChevronLeft className="h-4 w-4 mr-2" />
              Précédent
            </Button>

            <div className="flex items-center gap-1">
              {questions.map((_, index) => (
                <Button
                  key={index}
                  variant={index === currentQuestionIndex ? "default" : "outline"}
                  size="sm"
                  className={`w-8 h-8 p-0 ${
                    answers[questions[index]?.id] ? "bg-green-100 border-green-500" : ""
                  }`}
                  onClick={() => goToQuestion(index)}
                >
                  {index + 1}
                </Button>
              ))}
            </div>

            <Button
              variant="outline"
              onClick={() => goToQuestion(currentQuestionIndex + 1)}
              disabled={currentQuestionIndex === totalQuestions - 1}
            >
              Suivant
              <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </div>

        {/* Panneau latéral - Progression et actions */}
        <div className="space-y-4">
          <ExerciseProgressBar
            progress={progressPercentage}
            questionsAnswered={answeredQuestions}
            totalQuestions={totalQuestions}
            timeSpent={timeSpent}
          />

          {/* Actions */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <Button
                variant="outline"
                onClick={saveProgress}
                className="w-full"
                disabled={Object.keys(answers).length === 0}
              >
                <Save className="h-4 w-4 mr-2" />
                Sauvegarder
              </Button>

              <Button
                onClick={handleSubmit}
                className="w-full"
                disabled={isSubmitting || answeredQuestions < totalQuestions}
              >
                <Send className="h-4 w-4 mr-2" />
                {isSubmitting ? "Envoi..." : "Terminer l'exercice"}
              </Button>

              <Button
                variant="ghost"
                onClick={onExit}
                className="w-full"
              >
                Quitter
              </Button>
            </CardContent>
          </Card>

          {/* Aide */}
          <Card>
            <CardContent className="p-4">
              <h4 className="font-medium mb-2">💡 Conseils</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Vos réponses sont sauvegardées automatiquement</li>
                <li>• Vous pouvez naviguer entre les questions</li>
                <li>• Répondez à toutes les questions avant de terminer</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};