/**
 * Recette locale — Lot 5 (finance : facture, paiement, remboursement, relevé).
 *
 * Prérequis : API sur :4000, comptes seed (comptes RECETTE_* (env) + données métier).
 *   cd server && npx tsx scripts/recette-lot5.ts
 *
 * Mobile Money / carte (CinetPay, Stripe) : 501 sans clés sandbox — hors de
 * cette recette locale.
 */
import 'dotenv/config';
import { getRecetteLogin, getRecettePassword, getRecetteEmail } from './recetteCredentials.js';

const API = process.env.RECETTE_API_URL || 'http://127.0.0.1:4000';
const PASSWORD = getRecettePassword();

type Step = { id: string; ok: boolean; detail: string };
const steps: Step[] = [];

const record = (id: string, ok: boolean, detail: string) => {
  steps.push({ id, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id} — ${detail}`);
};

const json = async (res: Response) => {
  const text = await res.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { raw: text };
  }
};

const login = async (email: string) => {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  return { status: res.status, body: await json(res) };
};

const authHeaders = (token: string) => ({ Authorization: `Bearer ${token}` });

const stamp = `${Date.now()}`;
const today = () => new Date().toISOString().split('T')[0];
const isIntCents = (value: unknown) => Number.isInteger(Number(value));

type Invoice = {
  id: string;
  status: string;
  totalCents: number;
  paidCents: number;
  lines?: { lineType?: string; amountCents?: number }[];
  payments?: Payment[];
};
type Payment = {
  id: string;
  amountCents: number;
  status: string;
  verificationToken?: string | null;
  receiptNumber?: string | null;
};
type BankLine = { id: string; status: string; matchedPaymentId?: string | null };

async function main() {
  const health = await fetch(`${API}/health`);
  if (!health.ok) throw new Error(`API injoignable sur ${API} (${health.status})`);
  const healthBody = (await health.json()) as { databaseTarget?: { profile?: string } };
  console.log(`Cible API ${API} — profil DB : ${healthBody.databaseTarget?.profile ?? '?'}\n`);

  const accountant = await login(getRecetteEmail('staff'));
  if (accountant.status !== 200 || typeof accountant.body.token !== 'string') {
    record('L5-prep', false, `connexion comptable impossible (${accountant.status}) — relancer données métier + RECETTE_*`);
    process.exitCode = 1;
    return;
  }
  const token = accountant.body.token;
  const instA = (accountant.body.user as { institutionId?: string }).institutionId;
  if (!instA) {
    record('L5-prep', false, 'établissement manquant sur le compte comptable');
    process.exitCode = 1;
    return;
  }

  const studentsRes = await fetch(`${API}/students`, { headers: authHeaders(token) });
  const students =
    ((await json(studentsRes)).students as { id: string; profile?: { email?: string } }[] | undefined) ?? [];
  const lea = students.find((s) => s.profile?.email === getRecetteEmail('student'));
  if (!lea) {
    record('L5-prep', false, 'élève eleve@recette.local introuvable — relancer données métier + RECETTE_*');
    process.exitCode = 1;
    return;
  }

  const postJson = async (path: string, body: unknown) => {
    const res = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await json(res), res };
  };

  const createFee = async (amountCents: number, name: string) => {
    const created = await postJson('/finance/fee-items', { name, amountCents });
    return { status: created.status, id: (created.body.feeItem as { id?: string } | undefined)?.id };
  };

  const createInvoice = async (feeItemId: string, extraLines: unknown[] = []) => {
    const created = await postJson('/finance/invoices', {
      studentId: lea.id,
      lines: [{ feeItemId, quantity: 1 }, ...extraLines],
    });
    return { status: created.status, invoice: created.body.invoice as Invoice | undefined };
  };

  const payManual = async (invoiceId: string, amountCents: number, method: 'cash' | 'bank_transfer') => {
    const created = await postJson(`/finance/invoices/${invoiceId}/payments/manual`, { amountCents, method });
    return { status: created.status, payment: created.body.payment as Payment | undefined };
  };

  const getInvoice = async (invoiceId: string) => {
    const res = await fetch(`${API}/finance/invoices/${invoiceId}`, { headers: authHeaders(token) });
    return (await json(res)).invoice as Invoice | undefined;
  };

  // L5-1 — catalogue + remise, totaux en centimes entiers
  const fee1 = await createFee(100000, `Scolarité Recette-${stamp}`);
  const inv1 = await createInvoice(fee1.id ?? '', [
    { lineType: 'discount', label: `Bourse recette ${stamp}`, amountCents: 25000 },
  ]);
  const discountLine = inv1.invoice?.lines?.find((l) => l.lineType === 'discount');
  const l51ok =
    fee1.status === 201 &&
    !!fee1.id &&
    inv1.status === 201 &&
    !!inv1.invoice &&
    inv1.invoice.status === 'issued' &&
    inv1.invoice.totalCents === 75000 &&
    inv1.invoice.paidCents === 0 &&
    isIntCents(inv1.invoice.totalCents) &&
    isIntCents(inv1.invoice.paidCents) &&
    Number(discountLine?.amountCents) === 25000;
  record(
    'L5-1',
    l51ok,
    l51ok
      ? 'facture 100 000 − 25 000 = 75 000 centimes, statut issued'
      : `fee=${fee1.status} inv=${inv1.status} total=${inv1.invoice?.totalCents} status=${inv1.invoice?.status} discount=${discountLine?.amountCents}`
  );

  // L5-2 — paiement partiel puis solde + reçu QR
  const fee2 = await createFee(40000, `Cantine Recette-${stamp}`);
  const inv2 = await createInvoice(fee2.id ?? '');
  const partial = await payManual(inv2.invoice?.id ?? '', 15000, 'cash');
  const afterPartial = await getInvoice(inv2.invoice?.id ?? '');
  const balance = await payManual(inv2.invoice?.id ?? '', 25000, 'bank_transfer');
  const afterPaid = await getInvoice(inv2.invoice?.id ?? '');

  const receipt = await postJson('/documents/payment-receipt', { paymentId: balance.payment?.id });
  const documentId = (receipt.body.document as { id?: string; verificationToken?: string } | undefined)?.id;
  const docToken = (receipt.body.document as { verificationToken?: string } | undefined)?.verificationToken;
  const download = documentId
    ? await fetch(`${API}/documents/${documentId}/download`, { headers: authHeaders(token) })
    : null;
  const pdfHead = download ? Buffer.from(await download.arrayBuffer()).subarray(0, 5).toString() : '';
  const payToken = balance.payment?.verificationToken;
  const financeVerify = payToken ? await fetch(`${API}/finance/verify/${payToken}`) : null;
  const financeVerifyBody = financeVerify ? await json(financeVerify) : {};
  const docVerify = docToken ? await fetch(`${API}/documents/verify/${docToken}`) : null;
  const docVerifyBody = docVerify ? await json(docVerify) : {};

  const l52ok =
    inv2.status === 201 &&
    partial.status === 201 &&
    afterPartial?.status === 'partially_paid' &&
    afterPartial.paidCents === 15000 &&
    balance.status === 201 &&
    afterPaid?.status === 'paid' &&
    afterPaid.paidCents === 40000 &&
    receipt.status === 201 &&
    download?.status === 200 &&
    pdfHead === '%PDF-' &&
    financeVerify?.status === 200 &&
    financeVerifyBody.valid === true &&
    Number(financeVerifyBody.amountCents) === 25000 &&
    docVerify?.ok === true &&
    docVerifyBody.valid === true;
  record(
    'L5-2',
    l52ok,
    l52ok
      ? 'partiel 15 000 puis soldé 40 000 ; reçu PDF + QR finance/documents valides'
      : `inv=${inv2.status} partial=${partial.status}/${afterPartial?.status} balance=${balance.status}/${afterPaid?.status} receipt=${receipt.status} pdf=${pdfHead} finVerify=${financeVerify?.status}/${financeVerifyBody.valid} docVerify=${docVerify?.status}/${docVerifyBody.valid}`
  );

  // L5-3 — remboursement : paiement d'origine intact, remboursement tracé
  const fee3 = await createFee(60000, `Transport Recette-${stamp}`);
  const inv3 = await createInvoice(fee3.id ?? '');
  const paid3 = await payManual(inv3.invoice?.id ?? '', 60000, 'cash');
  const beforeRefund = await getInvoice(inv3.invoice?.id ?? '');
  const original = beforeRefund?.payments?.find((p) => p.id === paid3.payment?.id);
  const refund = await postJson(`/finance/payments/${paid3.payment?.id}/refund`, {
    amountCents: 60000,
    reason: `Recette L5-3 ${stamp}`,
  });
  const afterRefund = await getInvoice(inv3.invoice?.id ?? '');
  const refundedPayment = afterRefund?.payments?.find((p) => p.id === paid3.payment?.id);
  const refundRow = refund.body.refund as { id?: string; amountCents?: number; paymentId?: string } | undefined;

  const l53ok =
    paid3.status === 201 &&
    original?.status === 'paid' &&
    original.amountCents === 60000 &&
    refund.status === 201 &&
    !!refundRow?.id &&
    refundRow.amountCents === 60000 &&
    refundRow.paymentId === paid3.payment?.id &&
    refundedPayment?.status === 'refunded' &&
    refundedPayment.amountCents === 60000;
  record(
    'L5-3',
    l53ok,
    l53ok
      ? 'paiement 60 000 intact ; statut refunded ; remboursement tracé'
      : `pay=${paid3.status} orig=${original?.status}/${original?.amountCents} refund=${refund.status} after=${refundedPayment?.status}/${refundedPayment?.amountCents}`
  );

  // L5-4 — relevé : auto si candidat unique, manuel si ambigu
  const uniqueAuto = 610000 + (Date.now() % 90000);
  const uniqueAmb = uniqueAuto + 1111;
  const feeAuto = await createFee(uniqueAuto, `Auto Recette-${stamp}`);
  const invAuto = await createInvoice(feeAuto.id ?? '');
  const payAuto = await payManual(invAuto.invoice?.id ?? '', uniqueAuto, 'bank_transfer');

  const importAuto = await postJson('/finance/bank-statement/import', {
    institutionId: instA,
    lines: [{ date: today(), amountCents: uniqueAuto, label: `Virement unique ${stamp}` }],
  });
  const autoMatched = Number(importAuto.body.autoMatched);
  const autoLineId = ((importAuto.body.lineIds as string[] | undefined) ?? [])[0];
  const matchedLinesRes = await fetch(
    `${API}/finance/bank-statement/lines?institutionId=${instA}&status=matched`,
    { headers: authHeaders(token) }
  );
  const matchedLine = (((await json(matchedLinesRes)).lines as BankLine[] | undefined) ?? []).find(
    (l) => l.id === autoLineId
  );

  const feeAmb1 = await createFee(uniqueAmb, `Ambigu A Recette-${stamp}`);
  const feeAmb2 = await createFee(uniqueAmb, `Ambigu B Recette-${stamp}`);
  const invAmb1 = await createInvoice(feeAmb1.id ?? '');
  const invAmb2 = await createInvoice(feeAmb2.id ?? '');
  const payAmb1 = await payManual(invAmb1.invoice?.id ?? '', uniqueAmb, 'bank_transfer');
  await payManual(invAmb2.invoice?.id ?? '', uniqueAmb, 'bank_transfer');

  const importAmb = await postJson('/finance/bank-statement/import', {
    institutionId: instA,
    lines: [{ date: today(), amountCents: uniqueAmb, label: `Virement ambigu ${stamp}` }],
  });
  const ambMatched = Number(importAmb.body.autoMatched);
  const ambLineId = ((importAmb.body.lineIds as string[] | undefined) ?? [])[0];
  const unmatchedRes = await fetch(
    `${API}/finance/bank-statement/lines?institutionId=${instA}&status=unmatched`,
    { headers: authHeaders(token) }
  );
  const unmatchedHasAmb = (((await json(unmatchedRes)).lines as BankLine[] | undefined) ?? []).some(
    (l) => l.id === ambLineId
  );
  const manual = await postJson(`/finance/bank-statement/lines/${ambLineId}/match`, {
    paymentId: payAmb1.payment?.id,
  });
  const manualLine = (manual.body.line as BankLine | undefined) ?? { id: '', status: '' };

  const l54ok =
    payAuto.status === 201 &&
    importAuto.status === 201 &&
    autoMatched === 1 &&
    matchedLine?.matchedPaymentId === payAuto.payment?.id &&
    importAmb.status === 201 &&
    ambMatched === 0 &&
    unmatchedHasAmb &&
    manual.status === 200 &&
    manualLine.status === 'matched' &&
    manualLine.matchedPaymentId === payAmb1.payment?.id;
  record(
    'L5-4',
    l54ok,
    l54ok
      ? 'auto-match candidat unique ; ambiguïté laissée unmatched puis match manuel'
      : `auto=${importAuto.status}/${autoMatched} line=${matchedLine?.matchedPaymentId} amb=${importAmb.status}/${ambMatched} unmatched=${unmatchedHasAmb} manual=${manual.status}/${manualLine.status}`
  );

  const failed = steps.filter((s) => !s.ok);
  console.log(`\nLot 5 : ${steps.filter((s) => s.ok).length}/${steps.length} pass`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
