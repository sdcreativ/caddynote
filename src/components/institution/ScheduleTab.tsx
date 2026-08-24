import { Card, CardContent } from '@/components/ui/card';
import { Class, Teacher } from '@/types';

interface ScheduleTabProps {
  institutionId: string;
  classes: Class[];
  teachers: Teacher[];
}

/**
 * Ancien onglet emploi du temps institution basé sur des données fictives.
 * Retiré de l’UI Direction (plan UX) — reconstruit plus tard sur `useStrkSchedules`.
 * Stub conservé pour ne pas casser d’éventuels imports.
 */
export const ScheduleTab = (_props: ScheduleTabProps) => {
  return (
    <Card>
      <CardContent className="py-10 text-center text-sm text-muted-foreground">
        L’emploi du temps institution n’est pas encore branché sur les données
        réelles. Utilisez Calendrier ou les cours liés aux classes.
      </CardContent>
    </Card>
  );
};
