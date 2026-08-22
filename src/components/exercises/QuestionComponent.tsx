import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle, XCircle, HelpCircle } from "lucide-react";

interface QuestionComponentProps {
  question: any;
  answer?: any;
  onAnswerChange: (answer: any) => void;
  showResult?: boolean;
  isCorrect?: boolean;
  explanation?: string;
  disabled?: boolean;
}

export const QuestionComponent = ({
  question,
  answer,
  onAnswerChange,
  showResult = false,
  isCorrect,
  explanation,
  disabled = false,
}: QuestionComponentProps) => {
  const [currentAnswer, setCurrentAnswer] = useState(answer || null);

  useEffect(() => {
    setCurrentAnswer(answer || null);
  }, [answer]);

  const handleAnswerChange = (newAnswer: any) => {
    if (disabled) return;
    setCurrentAnswer(newAnswer);
    onAnswerChange(newAnswer);
  };

  const getQuestionIcon = () => {
    if (showResult) {
      return isCorrect ? (
        <CheckCircle className="h-5 w-5 text-green-500" />
      ) : (
        <XCircle className="h-5 w-5 text-red-500" />
      );
    }
    return <HelpCircle className="h-5 w-5 text-blue-500" />;
  };

  const renderMultipleChoice = () => (
    <RadioGroup
      value={currentAnswer || ""}
      onValueChange={handleAnswerChange}
      disabled={disabled}
      className="space-y-3"
    >
      {question.options?.map((option: any, index: number) => {
        const optionId = typeof option === 'string' ? option : option.id || index;
        const optionText = typeof option === 'string' ? option : option.text || option.label;
        const isSelected = currentAnswer === optionId;
        const isCorrectOption = question.correct_answer === optionId;
        
        let optionClass = "flex items-center space-x-3 p-3 rounded-lg border transition-colors";
        
        if (showResult) {
          if (isCorrectOption) {
            optionClass += " border-green-500 bg-green-50";
          } else if (isSelected && !isCorrectOption) {
            optionClass += " border-red-500 bg-red-50";
          } else {
            optionClass += " border-border bg-muted/30";
          }
        } else {
          optionClass += isSelected 
            ? " border-primary bg-primary/10" 
            : " border-border hover:border-primary/50";
        }

        return (
          <div key={optionId} className={optionClass}>
            <RadioGroupItem value={optionId} id={`option-${optionId}`} />
            <Label 
              htmlFor={`option-${optionId}`} 
              className="flex-1 cursor-pointer"
            >
              {optionText}
            </Label>
            {showResult && isCorrectOption && (
              <CheckCircle className="h-4 w-4 text-green-500" />
            )}
            {showResult && isSelected && !isCorrectOption && (
              <XCircle className="h-4 w-4 text-red-500" />
            )}
          </div>
        );
      })}
    </RadioGroup>
  );

  const renderTrueFalse = () => (
    <RadioGroup
      value={currentAnswer?.toString() || ""}
      onValueChange={(value) => handleAnswerChange(value === "true")}
      disabled={disabled}
      className="space-y-3"
    >
      {[
        { value: "true", label: "Vrai", icon: "✓" },
        { value: "false", label: "Faux", icon: "✗" }
      ].map((option) => {
        const isSelected = currentAnswer?.toString() === option.value;
        const isCorrectOption = question.correct_answer?.toString() === option.value;
        
        let optionClass = "flex items-center space-x-3 p-4 rounded-lg border transition-colors";
        
        if (showResult) {
          if (isCorrectOption) {
            optionClass += " border-green-500 bg-green-50";
          } else if (isSelected && !isCorrectOption) {
            optionClass += " border-red-500 bg-red-50";
          } else {
            optionClass += " border-border bg-muted/30";
          }
        } else {
          optionClass += isSelected 
            ? " border-primary bg-primary/10" 
            : " border-border hover:border-primary/50";
        }

        return (
          <div key={option.value} className={optionClass}>
            <RadioGroupItem value={option.value} id={`tf-${option.value}`} />
            <Label 
              htmlFor={`tf-${option.value}`} 
              className="flex-1 cursor-pointer flex items-center gap-2"
            >
              <span className="text-lg">{option.icon}</span>
              <span className="font-medium">{option.label}</span>
            </Label>
            {showResult && isCorrectOption && (
              <CheckCircle className="h-4 w-4 text-green-500" />
            )}
          </div>
        );
      })}
    </RadioGroup>
  );

  const renderOpenText = () => (
    <div className="space-y-2">
      <Textarea
        value={currentAnswer || ""}
        onChange={(e) => handleAnswerChange(e.target.value)}
        placeholder="Saisissez votre réponse..."
        disabled={disabled}
        className={`min-h-[100px] ${
          showResult 
            ? isCorrect 
              ? "border-green-500 bg-green-50" 
              : "border-red-500 bg-red-50"
            : ""
        }`}
      />
      {showResult && question.correct_answer && (
        <div className="p-3 bg-muted rounded-lg">
          <p className="text-sm font-medium text-muted-foreground mb-1">
            Réponse attendue :
          </p>
          <p className="text-sm">{question.correct_answer}</p>
        </div>
      )}
    </div>
  );

  const renderNumeric = () => (
    <div className="space-y-2">
      <Input
        type="number"
        value={currentAnswer || ""}
        onChange={(e) => handleAnswerChange(parseFloat(e.target.value) || null)}
        placeholder="Entrez un nombre..."
        disabled={disabled}
        className={`${
          showResult 
            ? isCorrect 
              ? "border-green-500 bg-green-50" 
              : "border-red-500 bg-red-50"
            : ""
        }`}
      />
      {showResult && question.correct_answer !== undefined && (
        <div className="p-3 bg-muted rounded-lg">
          <p className="text-sm font-medium text-muted-foreground mb-1">
            Réponse correcte :
          </p>
          <p className="text-sm font-mono">{question.correct_answer}</p>
        </div>
      )}
    </div>
  );

  const renderQuestion = () => {
    switch (question.question_type) {
      case 'multiple_choice':
        return renderMultipleChoice();
      case 'true_false':
        return renderTrueFalse();
      case 'open_text':
        return renderOpenText();
      case 'numeric':
        return renderNumeric();
      default:
        return (
          <div className="p-4 bg-muted rounded-lg text-center text-muted-foreground">
            Type de question non supporté : {question.question_type}
          </div>
        );
    }
  };

  return (
    <Card className={`transition-all duration-200 ${
      showResult 
        ? isCorrect 
          ? "border-green-200 bg-green-50/30" 
          : "border-red-200 bg-red-50/30"
        : "border-border"
    }`}>
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          {getQuestionIcon()}
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className="text-xs">
                {question.points || 10} points
              </Badge>
              <Badge variant="secondary" className="text-xs">
                {question.question_type?.replace('_', ' ')}
              </Badge>
            </div>
            <h3 className="text-base font-medium text-foreground">
              {question.question_text}
            </h3>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {renderQuestion()}
        
        {showResult && explanation && (
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-blue-900 mb-1">
                  Explication
                </p>
                <p className="text-sm text-blue-800">
                  {explanation}
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};