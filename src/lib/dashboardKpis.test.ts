import { describe, it, expect } from 'vitest';
import {
  summarizeOpenInvoices,
  countAbsencesSince,
  countOpenHomework,
  formatCentsFr,
} from './dashboardKpis';

describe('dashboardKpis', () => {
  it('summarizeOpenInvoices ignore paid/cancelled et calcule le reste', () => {
    const r = summarizeOpenInvoices([
      { status: 'issued', total_cents: 10000, paid_cents: 2500 },
      { status: 'paid', total_cents: 5000, paid_cents: 5000 },
      { status: 'cancelled', total_cents: 1000, paid_cents: 0 },
      { status: 'overdue', total_cents: 2000, paid_cents: 0 },
    ]);
    expect(r.invoicesOpen).toBe(2);
    expect(r.unpaidCents).toBe(7500 + 2000);
  });

  it('countAbsencesSince ne compte que les absences dans la fenêtre', () => {
    const now = Date.parse('2026-08-19T12:00:00Z');
    const since = now - 30 * 86400000;
    expect(
      countAbsencesSince(
        [
          { date: '2026-08-10', type: 'absence' },
          { date: '2026-07-01', type: 'absence' },
          { date: '2026-08-18', type: 'lateness' },
        ],
        since
      )
    ).toBe(1);
  });

  it('countOpenHomework exclut archivés et échéances trop anciennes', () => {
    const now = Date.parse('2026-08-19T12:00:00Z');
    expect(
      countOpenHomework(
        [
          { due_date: '2026-08-20', status: 'published' },
          { due_date: '2026-07-01', status: 'published' },
          { due_date: '2026-08-25', status: 'archived' },
          { due_date: null, status: 'draft' },
        ],
        now
      )
    ).toBe(2);
  });

  it('formatCentsFr formate sans décimales parasites', () => {
    expect(formatCentsFr(125000)).toMatch(/1[\s\u00a0]?250/);
  });
});
