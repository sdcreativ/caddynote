/**
 * Recette locale — Lot 10 (SaaS : quotas, suspension, feature flags).
 *
 * Prérequis : API sur :4000, comptes seed (comptes RECETTE_* (env) + données métier).
 *   cd server && npx tsx scripts/recette-lot10.ts
 *
 * Pose un plan/abonnement temporaire via Prisma (pas d’API de création de
 * formule), puis les retire toujours — l’école démo ne reste pas bloquée.
 */
import 'dotenv/config';
import { getRecetteLogin, getRecettePassword, getRecetteEmail } from './recetteCredentials.js';
import { prisma } from '../src/lib/prisma.js';

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

async function main() {
  const health = await fetch(`${API}/health`);
  if (!health.ok) throw new Error(`API injoignable sur ${API} (${health.status})`);
  const healthBody = (await health.json()) as { databaseTarget?: { profile?: string } };
  console.log(`Cible API ${API} — profil DB : ${healthBody.databaseTarget?.profile ?? '?'}\n`);

  const dirA = await login(getRecetteEmail('school_admin'));
  const dirB = await login(getRecetteEmail('school_admin'));
  const admin = await login(getRecetteEmail('admin'));
  if (dirA.status !== 200 || dirB.status !== 200 || admin.status !== 200) {
    record('L10-prep', false, `login A=${dirA.status} B=${dirB.status} admin=${admin.status}`);
    process.exitCode = 1;
    return;
  }

  const tokenA = dirA.body.token as string;
  const tokenB = dirB.body.token as string;
  const tokenAdmin = admin.body.token as string;
  const instA = (dirA.body.user as { institutionId?: string }).institutionId;
  const instB = (dirB.body.user as { institutionId?: string }).institutionId;
  const userA = (dirA.body.user as { id?: string }).id;
  const userB = (dirB.body.user as { id?: string }).id;
  if (!instA || !instB || !userA || !userB) {
    record('L10-prep', false, 'établissements A/B manquants — relancer données métier + RECETTE_*');
    process.exitCode = 1;
    return;
  }

  const createdPlanIds: string[] = [];
  const createdSubIds: string[] = [];

  const cleanup = async () => {
    if (createdSubIds.length) {
      await prisma.premiumSubscription.deleteMany({ where: { id: { in: createdSubIds } } }).catch(() => {});
    }
    if (createdPlanIds.length) {
      await prisma.subscriptionPlan.deleteMany({ where: { id: { in: createdPlanIds } } }).catch(() => {});
    }
    await fetch(`${API}/institutions/${instA}/features/aiTutor`, {
      method: 'PUT',
      headers: { ...authHeaders(tokenAdmin), 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: null }),
    }).catch(() => {});
  };

  try {
    const studentsRes = await fetch(`${API}/students`, { headers: authHeaders(tokenA) });
    const studentCount = (((await json(studentsRes)).students as unknown[] | undefined) ?? []).length;
    const maxStudents = Math.max(studentCount, 1);

    const plan = await prisma.subscriptionPlan.create({
      data: {
        name: `Recette quota ${stamp}`,
        priceMonthly: 0,
        maxStudents,
        maxUsers: 50,
        features: { advancedReports: true },
      },
    });
    createdPlanIds.push(plan.id);
    const subA = await prisma.premiumSubscription.create({
      data: {
        userId: userA,
        institutionId: instA,
        planId: plan.id,
        plan: plan.name,
        status: 'active',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    createdSubIds.push(subA.id);

    const quotasRes = await fetch(`${API}/institutions/${instA}/quotas`, { headers: authHeaders(tokenA) });
    const quotas = ((await json(quotasRes)).quotas as { type: string; current: number; limit: number | null; warning: boolean; allowed: boolean }[] | undefined) ?? [];
    const studentsQuota = quotas.find((q) => q.type === 'students');

    const createBlocked = await fetch(`${API}/users`, {
      method: 'POST',
      headers: { ...authHeaders(tokenA), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `trop.${stamp}@recette.local`,
        firstName: 'Trop',
        lastName: 'Nombreux',
        role: 'student',
        institutionId: instA,
      }),
    });
    const createBody = await json(createBlocked);
    const studentsAfter = await fetch(`${API}/students`, { headers: authHeaders(tokenA) });
    const countAfter = (((await json(studentsAfter)).students as unknown[] | undefined) ?? []).length;

    const importCsv = await fetch(`${API}/students/import`, {
      method: 'POST',
      headers: { ...authHeaders(tokenA), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        csv: 'firstName,lastName,email\nRecette,Import,import.recette@recette.local\n',
        institutionId: instA,
      }),
    });

    const l101ok =
      quotasRes.status === 200 &&
      studentsQuota?.limit === maxStudents &&
      studentsQuota.current === studentCount &&
      studentsQuota.warning === true &&
      createBlocked.status === 403 &&
      String(createBody.error ?? '').toLowerCase().includes('élève') &&
      countAfter === studentCount &&
      importCsv.status === 403;
    record(
      'L10-1',
      l101ok,
      l101ok
        ? `quota élèves ${studentCount}/${maxStudents} (alerte 80 %) ; création et import bloqués`
        : `quotas=${quotasRes.status} q=${JSON.stringify(studentsQuota)} create=${createBlocked.status} after=${countAfter} import=${importCsv.status}`
    );

    const studentsBBefore = await fetch(`${API}/students`, { headers: authHeaders(tokenB) });
    const countBBefore = (((await json(studentsBBefore)).students as unknown[] | undefined) ?? []).length;

    const subB = await prisma.premiumSubscription.create({
      data: {
        userId: userB,
        institutionId: instB,
        plan: `Recette suspendu ${stamp}`,
        status: 'suspended',
        suspendedAt: new Date(),
        expiresAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      },
    });
    createdSubIds.push(subB.id);

    const readB = await fetch(`${API}/students`, { headers: authHeaders(tokenB) });
    const exportB = await fetch(`${API}/reports/export?type=students&institutionId=${instB}&format=csv`, {
      headers: authHeaders(tokenB),
    });
    const writeB = await fetch(`${API}/users`, {
      method: 'POST',
      headers: { ...authHeaders(tokenB), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `bloque.${stamp}@recette.local`,
        firstName: 'Bloqué',
        lastName: 'Test',
        role: 'teacher',
        institutionId: instB,
      }),
    });
    const writeBody = await json(writeB);
    const studentsBAfter = await fetch(`${API}/students`, { headers: authHeaders(tokenB) });
    const countBAfter = (((await json(studentsBAfter)).students as unknown[] | undefined) ?? []).length;

    const l102ok =
      readB.status === 200 &&
      exportB.status === 200 &&
      writeB.status === 403 &&
      String(writeBody.error ?? '').includes('lecture seule') &&
      countBAfter === countBBefore;
    record(
      'L10-2',
      l102ok,
      l102ok
        ? 'suspendu : lecture + export OK ; écriture 403 ; données intactes'
        : `read=${readB.status} export=${exportB.status} write=${writeB.status} counts=${countBBefore}->${countBAfter}`
    );

    await prisma.premiumSubscription.delete({ where: { id: subB.id } }).catch(() => {});
    createdSubIds.splice(createdSubIds.indexOf(subB.id), 1);

    const putA = await fetch(`${API}/institutions/${instA}/features/aiTutor`, {
      method: 'PUT',
      headers: { ...authHeaders(tokenAdmin), 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    });
    const featuresA = await fetch(`${API}/institutions/${instA}/features`, { headers: authHeaders(tokenA) });
    const snapA = await json(featuresA);
    const featuresB = await fetch(`${API}/institutions/${instB}/features`, { headers: authHeaders(tokenB) });
    const snapB = await json(featuresB);
    const effectiveA = (snapA.effective as Record<string, boolean> | undefined) ?? {};
    const effectiveB = (snapB.effective as Record<string, boolean> | undefined) ?? {};
    const schoolAdminPut = await fetch(`${API}/institutions/${instA}/features/aiTutor`, {
      method: 'PUT',
      headers: { ...authHeaders(tokenA), 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    });

    const l103ok =
      putA.status === 200 &&
      featuresA.status === 200 &&
      effectiveA.aiTutor === true &&
      featuresB.status === 200 &&
      effectiveB.aiTutor !== true &&
      schoolAdminPut.status === 403;
    record(
      'L10-3',
      l103ok,
      l103ok
        ? 'flag pilote aiTutor sur A seulement ; B inchangé ; direction A ne peut pas se l’accorder'
        : `put=${putA.status} A=${effectiveA.aiTutor} B=${effectiveB.aiTutor} dirPut=${schoolAdminPut.status}`
    );
  } finally {
    await cleanup();
  }

  const failed = steps.filter((s) => !s.ok);
  console.log(`\nLot 10 : ${steps.filter((s) => s.ok).length}/${steps.length} pass`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
