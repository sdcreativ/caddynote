import { apiClient } from '@/lib/apiClient';

export type BankLine = {
  id: string;
  date: string;
  amountCents: number;
  currency: string;
  label: string;
  externalRef?: string | null;
  status: 'unmatched' | 'matched' | 'ignored';
  matchedPaymentId?: string | null;
};

export type BankSummary = {
  counts: { unmatched: number; matched: number; ignored: number };
  unmatchedLines: BankLine[];
  unreconciledPayments: Array<{
    id: string;
    amountCents: number;
    paidAt?: string | null;
    method?: string;
  }>;
};

export const importBankStatement = async (
  institutionId: string,
  lines: Array<{ date: string; amountCents: number; currency?: string; label: string; externalRef?: string }>
) => {
  return apiClient.post<{ imported: number; autoMatched: number; lineIds: string[] }>(
    '/finance/bank-statement/import',
    { institutionId, lines }
  );
};

export const listBankLines = async (institutionId: string, status?: string) => {
  const q = new URLSearchParams({ institutionId });
  if (status) q.set('status', status);
  const { lines } = await apiClient.get<{ lines: BankLine[] }>(`/finance/bank-statement/lines?${q}`);
  return lines;
};

export const getBankSummary = async (institutionId: string) => {
  const { counts, unmatchedLines, unreconciledPayments } = await apiClient.get<BankSummary>(
    `/finance/bank-statement/summary?institutionId=${encodeURIComponent(institutionId)}`
  );
  return { counts, unmatchedLines, unreconciledPayments };
};

export const autoMatchBankLine = async (lineId: string) => {
  return apiClient.post<{ matched: boolean; line: BankLine }>(
    `/finance/bank-statement/lines/${lineId}/auto-match`,
    {}
  );
};

export const matchBankLine = async (lineId: string, paymentId: string) => {
  return apiClient.post<{ line: BankLine }>(`/finance/bank-statement/lines/${lineId}/match`, {
    paymentId,
  });
};

export const ignoreBankLine = async (lineId: string) => {
  return apiClient.post<{ line: BankLine }>(`/finance/bank-statement/lines/${lineId}/ignore`, {});
};

export const refundPayment = async (paymentId: string, amountCents: number, reason?: string) => {
  const { refund } = await apiClient.post<{ refund: { id: string; amountCents: number } }>(
    `/finance/payments/${paymentId}/refund`,
    { amountCents, reason }
  );
  return refund;
};
