import { Bus, Utensils } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export type ParentServicesChild = {
  studentId: string;
  canteenEnabled?: boolean;
  canteenSubscriptions: Array<{
    id: string;
    planName: string;
    priceCents: number;
    currency: string;
    invoice?: { invoiceNumber: string; totalCents: number; status: string } | null;
  }>;
  transportEnrollments: Array<{
    id: string;
    routeName: string;
    scheduleSlots?: Array<{
      id: string;
      dayOfWeek: number;
      departureTime: string;
      direction: string;
      label?: string | null;
    }>;
  }>;
  availableTransportRoutes?: Array<{
    id: string;
    name: string;
    capacity: number | null;
    seatsLeft: number | null;
    scheduleSlots?: Array<{
      id: string;
      dayOfWeek: number;
      departureTime: string;
      direction: string;
    }>;
  }>;
  availableCanteenPlans?: Array<{
    id: string;
    name: string;
    priceCents: number;
    currency: string;
  }>;
  servicesEnabled: boolean;
};

type ParentServicesPanelProps = {
  loading: boolean;
  child: ParentServicesChild | null;
  actionId: string | null;
  onSubscribeCanteen: (planId: string) => void;
  onEnrollTransport: (routeId: string) => void;
};

/** Cantine / transport — extrait de Mes enfants pour alléger l’onglet principal. */
export function ParentServicesPanel({
  loading,
  child,
  actionId,
  onSubscribeCanteen,
  onEnrollTransport,
}: ParentServicesPanelProps) {
  if (loading) {
    return <p className="text-sm text-gray-500">Chargement…</p>;
  }

  if (!child?.servicesEnabled) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-gray-500">
          Aucun service établissement actif pour cet enfant.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Utensils className="h-4 w-4" aria-hidden /> Cantine
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {(child.canteenSubscriptions?.length ?? 0) === 0 ? (
            <p className="text-muted-foreground">Pas d’abonnement cantine</p>
          ) : (
            child.canteenSubscriptions.map((s) => (
              <div key={s.id} className="flex justify-between gap-2 rounded border px-3 py-2">
                <span>{s.planName}</span>
                <span className="text-right">
                  {(s.priceCents / 100).toLocaleString('fr-FR')} {s.currency}
                  {s.invoice?.invoiceNumber ? (
                    <Badge className="ml-2" variant="secondary">
                      {s.invoice.invoiceNumber}
                    </Badge>
                  ) : null}
                </span>
              </div>
            ))
          )}
          {child.canteenEnabled !== false && (child.availableCanteenPlans?.length ?? 0) > 0 ? (
            <div className="space-y-2 border-t pt-3">
              <p className="text-xs font-medium text-muted-foreground">Formules disponibles</p>
              {child.availableCanteenPlans!.map((plan) => (
                <div key={plan.id} className="flex items-center justify-between gap-2 rounded border px-3 py-2">
                  <span>
                    {plan.name}
                    <span className="ml-2 text-muted-foreground">
                      {(plan.priceCents / 100).toLocaleString('fr-FR')} {plan.currency}
                    </span>
                  </span>
                  <Button
                    size="sm"
                    disabled={actionId === plan.id}
                    onClick={() => onSubscribeCanteen(plan.id)}
                  >
                    {actionId === plan.id ? '…' : 'Souscrire'}
                  </Button>
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bus className="h-4 w-4" aria-hidden /> Transport
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {(child.transportEnrollments?.length ?? 0) === 0 ? (
            <p className="text-muted-foreground">Pas d’inscription transport</p>
          ) : (
            child.transportEnrollments.map((e) => (
              <div key={e.id} className="rounded border px-3 py-2">
                <p className="font-medium">{e.routeName}</p>
                {(e.scheduleSlots?.length ?? 0) > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {e.scheduleSlots!
                      .map((s) => `${s.departureTime} (${s.direction})`)
                      .join(' · ')}
                  </p>
                ) : null}
              </div>
            ))
          )}
          {(child.availableTransportRoutes?.length ?? 0) > 0 ? (
            <div className="space-y-2 border-t pt-3">
              <p className="text-xs font-medium text-muted-foreground">Lignes disponibles</p>
              {child.availableTransportRoutes!.map((route) => (
                <div key={route.id} className="flex items-center justify-between gap-2 rounded border px-3 py-2">
                  <span>
                    {route.name}
                    {route.seatsLeft != null ? (
                      <span className="ml-2 text-muted-foreground">{route.seatsLeft} places</span>
                    ) : null}
                  </span>
                  <Button
                    size="sm"
                    disabled={actionId === route.id}
                    onClick={() => onEnrollTransport(route.id)}
                  >
                    {actionId === route.id ? '…' : 'Inscrire'}
                  </Button>
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
