import { useEffect, useMemo, useState } from 'react';
import { useStrkAuth } from '@/hooks/useStrkAuth';
import {
  StudentSuiviMobileView,
  type SuiviToHandleItem,
} from '@/components/suivi/StudentSuiviMobileView';
import { fetchAbsencesByStudent, type StrkAbsence } from '@/services/strkAbsenceService';
import { fetchAssignmentsByStudent } from '@/services/strkAssignmentService';
import { fetchReceivedMessages } from '@/services/strkMessageService';
import { apiClient } from '@/lib/apiClient';
import { countAbsencesSince, countOpenHomework } from '@/lib/dashboardKpis';

type StudentDetail = {
  id: string;
  class?: { id: string; name: string } | null;
  profile?: { firstName: string | null; lastName: string | null; profileImage?: string | null };
};

/**
 * Suivi élève — présence du jour, mini À traiter, raccourcis scolaires.
 */
const MySuiviPage = () => {
  const { user } = useStrkAuth();
  const [absences, setAbsences] = useState<StrkAbsence[]>([]);
  const [homeworkCount, setHomeworkCount] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
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
        const [abs, detail, assignments, received] = await Promise.all([
          fetchAbsencesByStudent(user.id),
          apiClient
            .get<{ student: StudentDetail }>(`/students/${user.id}`)
            .then((r) => r.student)
            .catch(() => null),
          fetchAssignmentsByStudent(user.id).catch(() => []),
          fetchReceivedMessages(user.id).catch(() => []),
        ]);
        if (cancelled) return;
        setAbsences(abs);
        setHomeworkCount(countOpenHomework(assignments));
        setUnreadMessages(received.filter((m) => !m.read_at).length);
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

  const toHandle = useMemo((): SuiviToHandleItem[] => {
    const items: SuiviToHandleItem[] = [];
    if (homeworkCount > 0) {
      items.push({
        id: 'homework',
        title: `${homeworkCount} devoir(s) en cours`,
        href: '/assignments',
        tone: 'amber',
      });
    }
    const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const absenceCount = countAbsencesSince(absences, since);
    if (absenceCount > 0) {
      items.push({
        id: 'absences',
        title: `${absenceCount} absence(s) sur 30 jours`,
        href: '/my-absences',
        tone: 'rose',
      });
    }
    if (unreadMessages > 0) {
      items.push({
        id: 'messages',
        title: `${unreadMessages} message(s) non lu(s)`,
        href: '/messages',
        tone: 'blue',
      });
    }
    return items;
  }, [absences, homeworkCount, unreadMessages]);

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
        toHandle={toHandle}
      />
    </div>
  );
};

export default MySuiviPage;
