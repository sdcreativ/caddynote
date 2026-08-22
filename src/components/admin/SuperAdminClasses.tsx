import { useMemo, useState, Fragment } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useClassStats, type ClassStatItem } from "@/hooks/useClassStats";
import { EditClassDialog } from "./EditClassDialog";
import { ClassStudentsDialog } from "./ClassStudentsDialog";
import { CreateClassDialog } from "./CreateClassDialog";
import {
  BookOpen,
  Search,
  Users,
  Building2,
  Calendar,
  Edit,
  UserCheck,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { tCommon } from "@/i18n/config";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const institutionName = (classItem: ClassStatItem): string =>
  classItem.strk_institutions?.name?.trim() || '';

const SuperAdminClasses = () => {
  const { t } = useTranslation("admin");
  const { stats, loading, error, refetch } = useClassStats();
  const [searchTerm, setSearchTerm] = useState('');
  const [institutionFilter, setInstitutionFilter] = useState<string>('all');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showStudentsDialog, setShowStudentsDialog] = useState(false);
  const [selectedClass, setSelectedClass] = useState<ClassStatItem | null>(null);

  const institutionOptions = useMemo(() => {
    const names = new Set<string>();
    for (const c of stats.classesWithDetails) {
      const name = institutionName(c);
      if (name) names.add(name);
    }
    return [...names].sort((a, b) => a.localeCompare(b, 'fr'));
  }, [stats.classesWithDetails]);

  const filteredClasses = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return stats.classesWithDetails.filter((classItem) => {
      const inst = institutionName(classItem);
      if (institutionFilter !== 'all' && inst !== institutionFilter) return false;
      if (!q) return true;
      return (
        classItem.name.toLowerCase().includes(q) ||
        inst.toLowerCase().includes(q) ||
        (classItem.strk_profiles
          ? `${classItem.strk_profiles.first_name} ${classItem.strk_profiles.last_name}`
              .toLowerCase()
              .includes(q)
          : false)
      );
    });
  }, [stats.classesWithDetails, searchTerm, institutionFilter]);

  /** Groupes triés par nom d’établissement ; classes triées par nom dans chaque groupe. */
  const classesByInstitution = useMemo(() => {
    const groups = new Map<string, ClassStatItem[]>();
    for (const classItem of filteredClasses) {
      const key = institutionName(classItem) || t('classes.noInstitution');
      const list = groups.get(key) ?? [];
      list.push(classItem);
      groups.set(key, list);
    }
    for (const list of groups.values()) {
      list.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, 'fr'));
  }, [filteredClasses, t]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const openEdit = (classItem: ClassStatItem) => {
    setSelectedClass(classItem);
    setShowEditDialog(true);
  };

  const openStudents = (classItem: ClassStatItem) => {
    setSelectedClass(classItem);
    setShowStudentsDialog(true);
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-muted rounded w-1/3"></div>
        <div className="h-64 bg-muted rounded"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4 rounded-lg border border-destructive/30 bg-destructive/5 p-6">
        <h2 className="text-xl font-semibold">{t("classes.title")}</h2>
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button type="button" variant="outline" onClick={() => void refetch()}>
          Réessayer
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{t("classes.title")}</h2>
          <p className="text-muted-foreground">
            {t("classes.total", { count: stats.totalClasses })}
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <BookOpen className="h-4 w-4 mr-2" />
          {t("classes.newClass")}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t("classes.totalClasses")}</p>
                <p className="text-2xl font-bold">{stats.totalClasses}</p>
              </div>
              <BookOpen className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t("classes.institutions")}</p>
                <p className="text-2xl font-bold">{Object.keys(stats.classesByInstitution).length}</p>
              </div>
              <Building2 className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t("classes.avgSize")}</p>
                <p className="text-2xl font-bold">{stats.averageClassSize}</p>
              </div>
              <Users className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Assiduité moy.</p>
                <p className="text-2xl font-bold">
                  {stats.averageAttendanceRate > 0 ? `${stats.averageAttendanceRate} %` : '—'}
                </p>
              </div>
              <UserCheck className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("classes.search")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("classes.searchPlaceholder")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={institutionFilter} onValueChange={setInstitutionFilter}>
            <SelectTrigger className="w-full sm:w-[280px]" aria-label={t('classes.filterInstitution')}>
              <SelectValue placeholder={t('classes.filterInstitution')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('classes.allInstitutions')}</SelectItem>
              {institutionOptions.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("classes.listGrouped")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("classes.colClass")}</TableHead>
                <TableHead>{t("classes.colTeacher")}</TableHead>
                <TableHead>{t("classes.colStudents")}</TableHead>
                <TableHead>Absences (30j)</TableHead>
                <TableHead>Assiduité</TableHead>
                <TableHead>{t("classes.colYear")}</TableHead>
                <TableHead>{t("classes.colCreated")}</TableHead>
                <TableHead>{t("classes.colActions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {classesByInstitution.map(([instName, classes]) => (
                <Fragment key={`group-${instName}`}>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableCell colSpan={8} className="py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        <span className="font-semibold text-foreground">{instName}</span>
                        <Badge variant="secondary">
                          {t('classes.groupCount', { count: classes.length })}
                        </Badge>
                      </div>
                    </TableCell>
                  </TableRow>
                  {classes.map((classItem) => (
                    <TableRow key={classItem.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{classItem.name}</div>
                          <div className="text-sm text-muted-foreground">
                            {classItem.description || t("classes.noDescription")}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {classItem.strk_profiles ? (
                            `${classItem.strk_profiles.first_name} ${classItem.strk_profiles.last_name}`
                          ) : (
                            <span className="text-muted-foreground">{t("classes.unassigned")}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {t("classes.studentCount", {
                            count: classItem.studentCount ?? classItem.students ?? 0,
                          })}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm tabular-nums">{classItem.absences ?? 0}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm tabular-nums">
                          {classItem.attendanceRate != null ? `${classItem.attendanceRate} %` : '—'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {classItem.academic_year || (
                            <span className="text-muted-foreground">{t("classes.yearUndefined")}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center text-sm">
                          <Calendar className="mr-1 h-3 w-3" />
                          {classItem.created_at ? formatDate(classItem.created_at) : '—'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex space-x-2">
                          <Button variant="outline" size="sm" onClick={() => openEdit(classItem)}>
                            <Edit className="mr-1 h-3 w-3" />
                            {tCommon("actions.edit")}
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => openStudents(classItem)}>
                            <UserCheck className="mr-1 h-3 w-3" />
                            {t("classes.students")}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </Fragment>
              ))}
            </TableBody>
          </Table>

          {filteredClasses.length === 0 && (
            <div className="py-8 text-center text-muted-foreground">
              <BookOpen className="mx-auto mb-2 h-8 w-8 opacity-50" />
              <p>{t("classes.empty")}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <CreateClassDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onClassCreated={() => void refetch()}
      />

      <EditClassDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        classData={
          selectedClass
            ? {
                ...selectedClass,
                institution_id: selectedClass.institutionId || '',
                teacher_id: selectedClass.teacherId || 'none',
                max_students: selectedClass.maxStudents ?? 30,
                is_active: true,
              }
            : null
        }
        onClassUpdated={() => {
          setSelectedClass(null);
          void refetch();
        }}
      />

      <ClassStudentsDialog
        open={showStudentsDialog}
        onOpenChange={setShowStudentsDialog}
        classData={
          selectedClass
            ? {
                ...selectedClass,
                institution_id: selectedClass.institutionId || '',
                is_active: true,
              }
            : null
        }
        onChanged={() => void refetch()}
      />
    </div>
  );
};

export default SuperAdminClasses;
