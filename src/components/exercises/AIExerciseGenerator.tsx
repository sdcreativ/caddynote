import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Wand2, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAIExerciseHelper } from "@/hooks/useAIExerciseHelper";

interface AIExerciseGeneratorProps {
  onExerciseGenerated: (
    exercise: any,
    formData: { subject: string; topic: string; difficulty: number; questionCount: number; exerciseType: string }
  ) => void;
}

export const AIExerciseGenerator = ({ onExerciseGenerated }: AIExerciseGeneratorProps) => {
  const { toast } = useToast();
  const { generateExercise, loading } = useAIExerciseHelper();
  
  const [formData, setFormData] = useState({
    subject: "",
    topic: "",
    difficulty: 3,
    questionCount: 5,
    exerciseType: "quiz"
  });

  const handleGenerate = async () => {
    if (!formData.subject || !formData.topic) {
      toast({
        title: "Champs requis",
        description: "Veuillez remplir la matière et le sujet.",
        variant: "destructive"
      });
      return;
    }

    try {
      const result = await generateExercise(formData);
      onExerciseGenerated(result, formData);
      
      toast({
        title: "✨ Exercice généré avec succès !",
        description: `${result.questions?.length || 0} questions créées par l'IA`,
      });
    } catch (error) {
      toast({
        title: "Erreur de génération",
        description: "Impossible de générer l'exercice. Réessayez.",
        variant: "destructive"
      });
    }
  };

  return (
    <Card className="border-2 border-dashed border-primary/20 bg-gradient-to-br from-blue-50/50 to-purple-50/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Sparkles className="h-5 w-5 text-primary" />
          Générateur IA d'Exercices
          <Badge variant="secondary" className="ml-auto">
            🤖 Intelligence Artificielle
          </Badge>
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="subject">Matière *</Label>
            <Input
              id="subject"
              placeholder="ex: Mathématiques, Français..."
              value={formData.subject}
              onChange={(e) => setFormData(prev => ({ ...prev, subject: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="exerciseType">Type d'exercice</Label>
            <Select 
              value={formData.exerciseType} 
              onValueChange={(value) => setFormData(prev => ({ ...prev, exerciseType: value }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="quiz">Quiz</SelectItem>
                <SelectItem value="homework">Devoir</SelectItem>
                <SelectItem value="practice">Entraînement</SelectItem>
                <SelectItem value="assignment">Contrôle</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="topic">Sujet / Chapitre *</Label>
          <Textarea
            id="topic"
            placeholder="ex: Les équations du second degré, analyse de texte, etc."
            value={formData.topic}
            onChange={(e) => setFormData(prev => ({ ...prev, topic: e.target.value }))}
            rows={2}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="difficulty">Niveau de difficulté</Label>
            <Select 
              value={formData.difficulty.toString()} 
              onValueChange={(value) => setFormData(prev => ({ ...prev, difficulty: parseInt(value) }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">⭐ Très facile</SelectItem>
                <SelectItem value="2">⭐⭐ Facile</SelectItem>
                <SelectItem value="3">⭐⭐⭐ Moyen</SelectItem>
                <SelectItem value="4">⭐⭐⭐⭐ Difficile</SelectItem>
                <SelectItem value="5">⭐⭐⭐⭐⭐ Très difficile</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="questionCount">Nombre de questions</Label>
            <Select 
              value={formData.questionCount.toString()} 
              onValueChange={(value) => setFormData(prev => ({ ...prev, questionCount: parseInt(value) }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="3">3 questions</SelectItem>
                <SelectItem value="5">5 questions</SelectItem>
                <SelectItem value="10">10 questions</SelectItem>
                <SelectItem value="15">15 questions</SelectItem>
                <SelectItem value="20">20 questions</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="pt-4 border-t">
          <Button 
            onClick={handleGenerate} 
            disabled={loading}
            className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
            size="lg"
          >
            {loading ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Wand2 className="h-4 w-4 mr-2" />
            )}
            {loading ? "Génération en cours..." : "✨ Générer avec l'IA"}
          </Button>
        </div>

        <div className="text-xs text-muted-foreground text-center space-y-1">
          <p>🤖 L'IA créera des questions variées et adaptées au niveau choisi</p>
          <p>📚 Les explications pédagogiques sont incluses automatiquement</p>
        </div>
      </CardContent>
    </Card>
  );
};