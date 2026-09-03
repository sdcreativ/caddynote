import { CreditCard } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatInvoiceMoney, type StrkInvoice } from '@/services/strkFinanceService';

export type ParentFamilyFinanceRow = {
  studentId: string;
  name: string;
  unpaidCents: number;
  openCount: number;
  canView: boolean;
};

type ParentFinancePanelProps = {
  canViewBilling: boolean;
  canMakePayments: boolean;
  loading: boolean;
  invoices: StrkInvoice[];
  familyFinance: ParentFamilyFinanceRow[];
  selectedChildId: string | null;
  payingId: string | null;
  onSelectChild: (studentId: string) => void;
  onPay: (invoiceId: string, provider: 'cinetpay' | 'stripe') => void;
};

/** Facturation famille / enfant — extrait de Mes enfants. */
export function ParentFinancePanel({
  canViewBilling,
  canMakePayments,
  loading,
  invoices,
  familyFinance,
  selectedChildId,
  payingId,
  onSelectChild,
  onPay,
}: ParentFinancePanelProps) {
  return (
    <div className="space-y-4">
      {familyFinance.length > 1 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Vue famille</CardTitle>
            <CardDescription>
              Soldes par enfant (paiement multi-factures reporté — chaque facture se paie séparément).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {familyFinance.map((row) => (
              <button
                key={row.studentId}
                type="button"
                onClick={() => onSelectChild(row.studentId)}
                className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                  selectedChildId === row.studentId
                    ? 'border-blue-300 bg-blue-50'
                    : 'hover:bg-slate-50'
                }`}
              >
                <span className="font-medium">{row.name}</span>
                <span className="text-muted-foreground">
                  {!row.canView
                    ? 'Accès facturation fermé'
                    : row.openCount === 0
                      ? 'À jour'
                      : `${row.openCount} ouverte(s) · ${row.unpaidCents.toLocaleString('fr-FR')} ${
                          invoices[0]?.currency || 'XOF'
                        }`}
                </span>
              </button>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {!canViewBilling ? (
        <p className="text-sm text-gray-500">Vous n&apos;avez pas accès à la facturation de cet enfant.</p>
      ) : loading ? (
        <p className="text-sm text-gray-500">Chargement…</p>
      ) : invoices.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CreditCard className="mx-auto mb-4 h-12 w-12 text-gray-400" />
            <h3 className="mb-2 text-lg font-medium text-gray-900">Aucune facture</h3>
            <p className="text-gray-500">Les factures de scolarité apparaîtront ici.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {invoices.map((inv) => {
            const remaining = Math.max(0, inv.total_cents - inv.paid_cents);
            const canPay =
              canMakePayments &&
              remaining > 0 &&
              inv.status !== 'cancelled' &&
              inv.status !== 'paid';
            const stateLines = inv.lines.filter((l) => l.line_type === 'fee' && l.fee_origin === 'state');
            const schoolLines = inv.lines.filter((l) => l.line_type === 'fee' && l.fee_origin !== 'state');
            const discountLines = inv.lines.filter((l) => l.line_type === 'discount');
            const hasOriginSplit = inv.lines.some((l) => l.fee_origin);

            return (
              <Card key={inv.id}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{inv.invoice_number}</p>
                      <p className="text-sm text-gray-500">
                        Émise le {new Date(inv.issued_at).toLocaleDateString('fr-FR')}
                        {inv.due_date
                          ? ` · échéance ${new Date(inv.due_date).toLocaleDateString('fr-FR')}`
                          : ''}
                        {inv.fee_schedule_id ? ' · grille tarifaire' : ''}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold">{formatInvoiceMoney(inv, inv.total_cents)}</p>
                      <Badge variant={inv.status === 'paid' ? 'default' : 'secondary'}>{inv.status}</Badge>
                      <p className="mt-1 text-xs text-slate-500">
                        Payé {formatInvoiceMoney(inv, inv.paid_cents)}
                      </p>
                    </div>
                  </div>

                  {hasOriginSplit ? (
                    <div className="grid gap-2 text-sm md:grid-cols-2">
                      <div className="rounded-md border bg-slate-50/80 p-3">
                        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Frais officiels (État)
                        </p>
                        {stateLines.length === 0 ? (
                          <p className="text-muted-foreground">Aucun</p>
                        ) : (
                          <ul className="space-y-1">
                            {stateLines.map((l) => (
                              <li key={l.id} className="flex justify-between gap-2">
                                <span>{l.label}</span>
                                <span>{formatInvoiceMoney(inv, l.amount_cents * l.quantity)}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div className="rounded-md border bg-slate-50/80 p-3">
                        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Frais établissement
                        </p>
                        {schoolLines.length === 0 ? (
                          <p className="text-muted-foreground">Aucun</p>
                        ) : (
                          <ul className="space-y-1">
                            {schoolLines.map((l) => (
                              <li key={l.id} className="flex justify-between gap-2">
                                <span>{l.label}</span>
                                <span>{formatInvoiceMoney(inv, l.amount_cents * l.quantity)}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      {discountLines.length > 0 ? (
                        <div className="rounded-md border border-amber-200 bg-amber-50/50 p-3 md:col-span-2">
                          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-700">
                            Remises / prises en charge
                          </p>
                          <ul className="space-y-1">
                            {discountLines.map((l) => (
                              <li key={l.id} className="flex justify-between gap-2">
                                <span>{l.label}</span>
                                <span>− {formatInvoiceMoney(inv, l.amount_cents * l.quantity)}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {canPay ? (
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button
                        size="sm"
                        disabled={payingId === inv.id}
                        onClick={() => onPay(inv.id, 'cinetpay')}
                      >
                        Payer par Mobile Money
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={payingId === inv.id}
                        onClick={() => onPay(inv.id, 'stripe')}
                      >
                        Payer par carte
                      </Button>
                    </div>
                  ) : null}
                  {!canMakePayments && remaining > 0 && inv.status !== 'cancelled' ? (
                    <p className="text-xs text-muted-foreground">
                      Consultation seule — le paiement en ligne n’est pas autorisé pour votre lien.
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
