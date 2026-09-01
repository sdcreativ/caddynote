import { useStrkAuth } from '@/hooks/useStrkAuth';
import { NotificationCenter } from '@/components/notifications/NotificationCenter';

/** Page dédiée aux notifications (onglet mobile parent / élève). */
const NotificationsPage = () => {
  const { user } = useStrkAuth();

  if (!user) return null;

  return (
    <div className="space-y-4 py-2 md:py-4">
      <div className="md:hidden">
        <h1 className="text-xl font-semibold text-slate-900">Notifications</h1>
      </div>
      <div className="hidden md:block">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Notifications</h1>
        <p className="mt-1 text-slate-600">Alertes et rappels de votre établissement</p>
      </div>
      <NotificationCenter userId={user.id} className="w-full max-w-none border-0 shadow-none" />
    </div>
  );
};

export default NotificationsPage;
