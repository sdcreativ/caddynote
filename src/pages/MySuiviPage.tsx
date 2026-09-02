import { useEffect, useState } from 'react';
import { useStrkAuth } from '@/hooks/useStrkAuth';
import { StudentSuiviMobileView } from '@/components/suivi/StudentSuiviMobileView';
import { fetchAbsencesByStudent, type StrkAbsence } from '@/services/strkAbsenceService';
import { apiClient } from '@/lib/apiClient';

type StudentDetail = {
  id: string;
  class?: { id: string; name: string } | null;
  profile?: { firstName: string | null; lastName: string | null; profileImage?: string | null };
};

/**
 * Suivi élève — présence du jour + raccourcis scolaires.
 * Les priorités « À traiter » sont sur l’Accueil (`/dashboard`).
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
        actionsMode="student"
      />
    </div>
  );
};

export default MySuiviPage;
