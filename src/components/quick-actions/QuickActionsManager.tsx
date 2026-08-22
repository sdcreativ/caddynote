import { useState, createContext, useContext, useEffect, ReactNode } from 'react';
import { useStrkAuth } from '@/hooks/useStrkAuth';
import { useStrkCourses } from '@/hooks/useStrkCourses';
import { CreateAbsenceDialog } from '@/components/absences/CreateAbsenceDialog';
import { CreateSignatureDialog } from '@/components/signature/CreateSignatureDialog';
import { AttendanceDialog } from '@/components/attendance/AttendanceDialog';
import CreateCourseDialog from '@/components/teaching/CreateCourseDialog';
import { JustificationDialog } from '@/components/absences/JustificationDialog';
import AddEventDialog from '@/components/calendar/AddEventDialog';
import CreateUserDialog from '@/components/admin/CreateUserDialog';

interface QuickActionsContextType {
  openAbsenceDialog: () => void;
  openSignatureDialog: () => void;
  openAttendanceDialog: () => void;
  openCourseDialog: () => void;
  openJustificationDialog: () => void;
  openEventDialog: (date?: Date) => void;
  openUserDialog: () => void;
  activeDialog: 'absence' | 'signature' | 'attendance' | 'course' | 'justification' | 'event' | 'user' | null;
  closeDialog: () => void;
  selectedDate: Date | null;
}

const QuickActionsContext = createContext<QuickActionsContextType | undefined>(undefined);

export function QuickActionsProvider({ children }: { children: ReactNode }) {
  const [activeDialog, setActiveDialog] = useState<'absence' | 'signature' | 'attendance' | 'course' | 'justification' | 'event' | 'user' | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const contextValue = {
    openAbsenceDialog: () => setActiveDialog('absence'),
    openSignatureDialog: () => setActiveDialog('signature'),
    openAttendanceDialog: () => setActiveDialog('attendance'),
    openCourseDialog: () => setActiveDialog('course'),
    openJustificationDialog: () => setActiveDialog('justification'),
    openEventDialog: (date?: Date) => {
      setSelectedDate(date || null);
      setActiveDialog('event');
    },
    openUserDialog: () => setActiveDialog('user'),
    activeDialog,
    selectedDate,
    closeDialog: () => {
      setActiveDialog(null);
      setSelectedDate(null);
    }
  };

  return (
    <QuickActionsContext.Provider value={contextValue}>
      {children}
    </QuickActionsContext.Provider>
  );
}

export function QuickActionsManager() {
  const { user } = useStrkAuth();
  const context = useContext(QuickActionsContext);
  // NFR-004 : `AttendanceDialog` a besoin des cours réels de l'enseignant
  // pour proposer un choix de classe (voir le composant — il ne reçoit plus
  // de texte libre déconnecté d'une vraie classe). Chargé une fois, comme le
  // fait déjà `TeacherAttendancePage.tsx` pour son propre sélecteur.
  const { courses, loadCoursesByTeacher } = useStrkCourses();

  useEffect(() => {
    if (user?.id && user.role === 'teacher') {
      loadCoursesByTeacher(user.id);
    }
  }, [user?.id, user?.role, loadCoursesByTeacher]);

  if (!context) {
    console.error('QuickActionsManager must be used within QuickActionsProvider');
    return null;
  }

  const { activeDialog, closeDialog, selectedDate } = context;

  const handleAddEvent = (_eventData: unknown) => {
    // L'événement est déjà sauvegardé dans la base de données par AddEventDialog
    // Nous fermons simplement le dialogue ici
    closeDialog();

    // Recharger les emplois du temps pour mettre à jour le calendrier
    if (user) {
      if (user.role === 'student') {
        // Pour un étudiant, recharger ses cours
        // Cette fonction est appelée dans CalendarPage.tsx
      } else if (user.role === 'teacher') {
        // Pour un enseignant, recharger ses cours
        // Cette fonction est appelée dans CalendarPage.tsx
      }
    }
  };

  return (
    <>
      <CreateAbsenceDialog
        open={activeDialog === 'absence'}
        onOpenChange={closeDialog}
        institutionId={user?.institutionId || ''}
      />

      <CreateSignatureDialog
        open={activeDialog === 'signature'}
        onOpenChange={closeDialog}
      />

      <AttendanceDialog
        open={activeDialog === 'attendance'}
        onOpenChange={closeDialog}
        courses={courses}
        institutionId={user?.institutionId}
      />

      <CreateCourseDialog
        open={activeDialog === 'course'}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
      />

      <JustificationDialog
        open={activeDialog === 'justification'}
        onOpenChange={closeDialog}
      />

      <AddEventDialog
        open={activeDialog === 'event'}
        onOpenChange={closeDialog}
        onAddEvent={handleAddEvent}
        initialDate={selectedDate}
      />

      <CreateUserDialog
        open={activeDialog === 'user'}
        onOpenChange={closeDialog}
        onUserCreated={() => {
          closeDialog();
        }}
      />
    </>
  );
}

// Hook pour utiliser les actions rapides
export function useQuickActions() {
  const context = useContext(QuickActionsContext);
  if (context === undefined) {
    throw new Error('useQuickActions must be used within a QuickActionsProvider');
  }
  return context;
}
