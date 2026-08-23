import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '../lib/prisma.js';

/**
 * Lot 1 grille financière — seeds schéma (catalogue + référentiel national CI).
 * Pas de moteur métier ici (Lot 2).
 */
describe('Fee grid Lot 1 — seeds & schéma', () => {
  beforeAll(async () => {
    // Smoke : la connexion Prisma / migrations doivent être appliquées sur la DB de test.
    await prisma.$queryRaw`SELECT 1`;
  });

  it('seed le catalogue plateforme StrkFeeType (codes doc §3)', async () => {
    const types = await prisma.strkFeeType.findMany({
      where: { institutionId: null },
      orderBy: { sortOrder: 'asc' },
    });
    expect(types.length).toBeGreaterThanOrEqual(23);
    const codes = types.map((t) => t.code);
    expect(codes).toContain('STATE_REGISTRATION');
    expect(codes).toContain('ANNUAL_TUITION');
    expect(codes).toContain('OTHER_FEE');
    expect(codes).toContain('LATE_PENALTY');
  });

  it('seed les cycles et niveaux de classe CI', async () => {
    const cycles = await prisma.strkEducationCycle.findMany({ orderBy: { sortOrder: 'asc' } });
    expect(cycles.map((c) => c.code)).toEqual(['PRESCHOOL', 'PRIMARY', 'COLLEGE', 'LYCEE']);

    const grades = await prisma.strkGradeLevel.findMany();
    expect(grades).toHaveLength(16);
    expect(grades.some((g) => g.code === 'COLLEGE_6')).toBe(true);
    expect(grades.some((g) => g.code === 'LYCEE_TERMINALE')).toBe(true);
  });

  it('seed le référentiel national CI 2026-2027 (0 / 6000 / 3000)', async () => {
    const version = await prisma.strkNationalFeeVersion.findFirst({
      where: { countryCode: 'CI', academicYear: '2026-2027', status: 'published' },
      include: { rates: true },
    });
    expect(version).not.toBeNull();
    expect(version!.managedBy).toBe('state_ci');
    expect(version!.currency).toBe('XOF');
    expect(version!.rates).toHaveLength(8);

    const byKey = Object.fromEntries(
      version!.rates.map((r) => [`${r.cycleCode}:${r.fundingSector}`, r.amountCents]),
    );
    expect(byKey['PRESCHOOL:public']).toBe(0);
    expect(byKey['PRIMARY:private']).toBe(0);
    expect(byKey['COLLEGE:public']).toBe(6000);
    expect(byKey['COLLEGE:private']).toBe(3000);
    expect(byKey['LYCEE:public']).toBe(6000);
    expect(byKey['LYCEE:private']).toBe(3000);
  });

  it('expose les colonnes snapshot facture / plan (additives)', async () => {
    const cols = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'strk_invoices'
        AND column_name IN ('fee_schedule_id', 'fee_schedule_version', 'tariff_snapshot')
      ORDER BY column_name
    `;
    expect(cols.map((c) => c.column_name)).toEqual([
      'fee_schedule_id',
      'fee_schedule_version',
      'tariff_snapshot',
    ]);

    const planCols = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'strk_payment_plans'
        AND column_name IN ('fee_schedule_id', 'plan_template_id')
      ORDER BY column_name
    `;
    expect(planCols.map((c) => c.column_name)).toEqual([
      'fee_schedule_id',
      'plan_template_id',
    ]);
  });

  it('n’a pas remplacé les tables finance AR existantes', async () => {
    const tables = await prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename IN (
          'strk_fee_items', 'strk_invoices', 'strk_invoice_lines',
          'strk_payments', 'strk_refunds', 'strk_payment_plans',
          'strk_fee_schedules', 'strk_fee_plan_templates'
        )
      ORDER BY tablename
    `;
    expect(tables.map((t) => t.tablename)).toEqual([
      'strk_fee_items',
      'strk_fee_plan_templates',
      'strk_fee_schedules',
      'strk_invoice_lines',
      'strk_invoices',
      'strk_payment_plans',
      'strk_payments',
      'strk_refunds',
    ]);
  });
});
