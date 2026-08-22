import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchClassesByInstitution, type ClassWithDetails } from "@/services/strkClassService";
import { fetchStrkSubjectsByInstitution, type StrkSubject } from "@/services/strkSubjectService";

/**
 * RPT-001 — composant de filtre standardisé et réutilisable pour les écrans
 * de reporting. Les primitives ci-dessous existaient déjà côté serveur,
 * chacune sur son propre endpoint (institutionId partout — ORG-004, plage de
 * dates sur absences/notes/export, matière sur les notes — EVA-004) mais
 * n'étaient branchées sur aucune interface commune (voir audit §4.15).
 *
 * Volontairement absents de ce composant : "niveau" et "statut". Le cahier
 * des charges les cite, mais ni l'un ni l'autre n'existe comme concept
 * structurant côté données — il n'y a pas de champ "niveau" distinct de la
 * classe (le niveau est encodé dans le nom de la classe, ex. "6ème A" —
 * ajouter un filtre "niveau" reviendrait à dupliquer le filtre classe), et
 * "statut" n'a de sens que pour des écrans précis (admissions, discipline)
 * déjà filtrables sur leur propre page — l'imposer ici serait un champ
 * fictif, sans portée réelle, sur les écrans qui ne l'utilisent pas.
 */
export interface ReportFiltersValue {
  institutionId?: string;
  startDate?: string;
  endDate?: string;
  classId?: string;
  subjectId?: string;
}

export interface ReportFiltersShow {
  institution?: boolean;
  dateRange?: boolean;
  classId?: boolean;
  subjectId?: boolean;
}

interface ReportFiltersProps {
  value: ReportFiltersValue;
  onChange: (next: ReportFiltersValue) => void;
  show: ReportFiltersShow;
  /** Requis si show.institution : liste des établissements sélectionnables. */
  institutions?: Array<{ id: string; name: string }>;
  /**
   * Établissement auquel scoper le chargement des classes/matières quand le
   * filtre établissement n'est pas affiché (l'appelant est déjà limité à son
   * propre établissement). Ignoré si show.institution est actif — c'est
   * alors value.institutionId qui fait foi.
   */
  scopeInstitutionId?: string;
}

const ALL = "__all__";

export const ReportFilters = ({ value, onChange, show, institutions, scopeInstitutionId }: ReportFiltersProps) => {
  const { t } = useTranslation('exports');
  const [classes, setClasses] = useState<ClassWithDetails[]>([]);
  const [subjects, setSubjects] = useState<StrkSubject[]>([]);
  const effectiveInstitutionId = show.institution ? value.institutionId : scopeInstitutionId;

  useEffect(() => {
    if (!effectiveInstitutionId || !(show.classId || show.subjectId)) {
      setClasses([]);
      setSubjects([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const [classList, subjectList] = await Promise.all([
        show.classId ? fetchClassesByInstitution(effectiveInstitutionId) : Promise.resolve([]),
        show.subjectId ? fetchStrkSubjectsByInstitution(effectiveInstitutionId) : Promise.resolve([]),
      ]);
      if (!cancelled) {
        setClasses(classList);
        setSubjects(subjectList);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveInstitutionId, show.classId, show.subjectId]);

  const patch = (partial: Partial<ReportFiltersValue>) => onChange({ ...value, ...partial });

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {show.institution && (
        <div className="space-y-2">
          <Label>{t('filters.institution')}</Label>
          <Select
            value={value.institutionId ?? ALL}
            onValueChange={(v) =>
              patch({ institutionId: v === ALL ? undefined : v, classId: undefined, subjectId: undefined })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder={t('filters.allInstitutions')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t('filters.allInstitutions')}</SelectItem>
              {(institutions ?? []).map((inst) => (
                <SelectItem key={inst.id} value={inst.id}>
                  {inst.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {show.dateRange && (
        <>
          <div className="space-y-2">
            <Label>{t('filters.startDate')}</Label>
            <Input type="date" value={value.startDate ?? ""} onChange={(e) => patch({ startDate: e.target.value || undefined })} />
          </div>
          <div className="space-y-2">
            <Label>{t('filters.endDate')}</Label>
            <Input type="date" value={value.endDate ?? ""} onChange={(e) => patch({ endDate: e.target.value || undefined })} />
          </div>
        </>
      )}

      {show.classId && (
        <div className="space-y-2">
          <Label>{t('filters.class')}</Label>
          <Select
            value={value.classId ?? ALL}
            onValueChange={(v) => patch({ classId: v === ALL ? undefined : v })}
            disabled={!effectiveInstitutionId}
          >
            <SelectTrigger>
              <SelectValue placeholder={t('filters.allClasses')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t('filters.allClasses')}</SelectItem>
              {classes.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {show.subjectId && (
        <div className="space-y-2">
          <Label>{t('filters.subject')}</Label>
          <Select
            value={value.subjectId ?? ALL}
            onValueChange={(v) => patch({ subjectId: v === ALL ? undefined : v })}
            disabled={!effectiveInstitutionId}
          >
            <SelectTrigger>
              <SelectValue placeholder={t('filters.allSubjects')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t('filters.allSubjects')}</SelectItem>
              {subjects.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
};
