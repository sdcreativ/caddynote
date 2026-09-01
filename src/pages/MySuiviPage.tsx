import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStrkAuth } from '@/hooks/useStrkAuth';
import { StudentSuiviMobileView } from '@/components/suivi/StudentSuiviMobileView';
import { fetchAbsencesByStudent, type StrkAbsence } from '@/services/strkAbsenceService';
import { apiClient } from '@/lib/apiClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { BookOpen, GraduationCap, Calendar } from 'lucide-react';

type StudentDetail = {
  id: string;
  class?: { id: string; name: string } | null;
  profile?: { firstName: string | null; lastName: string | null; profileImage?: string | null };
};

/**
 * Suivi mobile élève — présence du jour, identité, accès messages.
 * Desktop : même héros + raccourcis notes / devoirs / absences.
 */
const MySuiviPage = () => {
  const { user } = useStrkAuth();
  const [absences, setAbsences] = useState<StrkAbsence[]>([]);
  const [loading, setLoading] = useState(true);
  const [className, setClassName] = useState<string | null>(null);
  const [profileImage, setProfileImage] = useState<string | null | undefined>(user?.profileImage);
  const [firstName, setFirstName] = useState(user?.name?.split(' ')[0] || 'Élève');
  const [lastName, setLastName] = useState(user?.name?.split(' ').slice(1).join(' ') || '');

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [abs, detail] = await Promise.all([
          fetchAbsencesByStudent(user.id),
          apiClient
            .get<{ student: StudentDetail }>(`/students/${user.id}`)
            .then((r) => r.student)
            .catch(() => null),
        ]);
        if (cancelled) return;
        setAbsences(abs);
        setClassName(detail?.class?.name ?? null);
        if (detail?.profile?.profileImage) setProfileImage(detail.profile.profileImage);
        if (detail?.profile?.firstName) setFirstName(detail.profile.firstName);
        if (detail?.profile?.lastName) setLastName(detail.profile.lastName ?? '');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  if (!user) return null;

  return (
    <div className="space-y-6 pb-2">
      <StudentSuiviMobileView
        headerTitle={`Suivi de ${firstName}`}
        firstName={firstName}
        lastName={lastName}
        className={className}
        profileImage={profileImage}
        absences={absences}
        absencesLoading={loading}
      />

      <div className="hidden grid-cols-3 gap-3 md:grid">
        <Card>
          <CardContent className="flex flex-col items-start gap-2 p-4">
            <GraduationCap className="h-5 w-5 text-blue-600" />
            <p className="font-semibold">Notes</p>
            <Button asChild variant="link" className="h-auto p-0">
              <Link to="/my-grades">Voir</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col items-start gap-2 p-4">
            <BookOpen className="h-5 w-5 text-blue-600" />
            <p className="font-semibold">Devoirs</p>
            <Button asChild variant="link" className="h-auto p-0">
              <Link to="/assignments">Voir</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col items-start gap-2 p-4">
            <Calendar className="h-5 w-5 text-blue-600" />
            <p className="font-semibold">Absences</p>
            <Button asChild variant="link" className="h-auto p-0">
              <Link to="/my-absences">Voir</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default MySuiviPage;
