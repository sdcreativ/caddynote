import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useStrkSchedules } from '@/hooks/useStrkSchedules';
import type { StrkSchedule } from '@/types/strk';

const DAY_LABELS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'] as const;

interface ScheduleTabProps {
  institutionId: string;
  /** Conservé pour compat éventuelle — non requis pour le chargement. */
  classes?: unknown[];
  teachers?: unknown[];
}

/**
 * Synthèse EDT établissement (données réelles via `/schedules`).
 * Édition / grille complète : page Calendrier.
 */
export const ScheduleTab = ({ institutionId }: ScheduleTabProps) => {
  const { schedules, isLoading, loadSchedulesByInstitution } = useStrkSchedules();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!institutionId) return;
    void loadSchedulesByInstitution(institutionId).finally(() => setLoaded(true));
  }, [institutionId, loadSchedulesByInstitution]);

  const byDay = useMemo(() => {
    const map = new Map<number, StrkSchedule[]>();
    for (const s of schedules) {
      const day = s.day_of_week;
      const list = map.get(day) ?? [];
      list.push(s);
      map.set(day, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)));
    }
    return map;
  }, [schedules]);

  const weekDays = [1, 2, 3, 4, 5, 6, 0].filter((d) => (byDay.get(d)?.length ?? 0) > 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarDays className="h-4 w-4" />
          Emploi du temps
        </CardTitle>
        <Button asChild size="sm" variant="outline">
          <Link to="/calendar">Ouvrir le calendrier</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {isLoading || !loaded ? (
          <p className="text-muted-foreground">Chargement…</p>
        ) : schedules.length === 0 ? (
          <p className="text-muted-foreground">
            Aucun créneau pour cet établissement. Créez-en depuis le calendrier ou les cours.
          </p>
        ) : (
          <>
            <p className="text-muted-foreground">
              {schedules.length} créneau{schedules.length > 1 ? 'x' : ''} planifié
              {schedules.length > 1 ? 's' : ''}
            </p>
            <div className="space-y-2">
              {weekDays.map((day) => (
                <div key={day} className="rounded-lg border px-3 py-2">
                  <div className="mb-1.5 flex items-center gap-2">
                    <Badge variant="secondary">{DAY_LABELS[day]}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {byDay.get(day)!.length} séance{byDay.get(day)!.length > 1 ? 's' : ''}
                    </span>
                  </div>
                  <ul className="space-y-1">
                    {byDay.get(day)!.slice(0, 4).map((s) => (
                      <li key={s.id} className="flex justify-between gap-2 text-xs">
                        <span className="truncate">
                          {s.start_time}–{s.end_time}
                          {s.course?.name ? ` · ${s.course.name}` : ''}
                          {s.room ? ` · ${s.room}` : ''}
                        </span>
                      </li>
                    ))}
                    {byDay.get(day)!.length > 4 ? (
                      <li className="text-xs text-muted-foreground">
                        +{byDay.get(day)!.length - 4} autres…
                      </li>
                    ) : null}
                  </ul>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};
