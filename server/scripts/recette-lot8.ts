/**
 * Recette locale — Lot 8 (reporting : exports réels, analytics réservées).
 *
 * Prérequis : API sur :4000, comptes seed (comptes RECETTE_* (env) + données métier).
 *   cd server && npx tsx scripts/recette-lot8.ts
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
const DRAFT_VALUE = 4;
const PUBLISHED_VALUE = 16;
const DRAFT_MARKER = `L8-DRAFT-${stamp}`;
const PUB_MARKER = `L8-PUB-${stamp}`;

async function main() {
  const health = await fetch(`${API}/health`);
  if (!health.ok) throw new Error(`API injoignable sur ${API} (${health.status})`);
  const healthBody = (await health.json()) as { databaseTarget?: { profile?: string } };
  console.log(`Cible API ${API} — profil DB : ${healthBody.databaseTarget?.profile ?? '?'}\n`);

  const dir = await login(getRecetteEmail('school_admin'));
  const teacher = await login(getRecetteEmail('teacher'));
  const student = await login(getRecetteEmail('student'));
  if (dir.status !== 200 || teacher.status !== 200 || student.status !== 200) {
    record('L8-prep', false, `login direction=${dir.status} enseignant=${teacher.status} élève=${student.status}`);
    process.exitCode = 1;
    return;
  }

  const tokenDir = dir.body.token as string;
  const tokenTeacher = teacher.body.token as string;
  const tokenStudent = student.body.token as string;
  const instA = (dir.body.user as { institutionId?: string }).institutionId;
  const teacherId = (teacher.body.user as { id?: string }).id;
  const studentId = (student.body.user as { id?: string }).id;
  if (!instA || !teacherId || !studentId) {
    record('L8-prep', false, 'identifiants manquants');
    process.exitCode = 1;
    return;
  }

  const classesRes = await fetch(`${API}/classes?institutionId=${instA}`, { headers: authHeaders(tokenDir) });
  const classA = (((await json(classesRes)).classes as { id: string }[] | undefined) ?? [])[0];
  const coursesRes = await fetch(`${API}/courses?institutionId=${instA}`, { headers: authHeaders(tokenDir) });
  const course = (((await json(coursesRes)).courses as { id: string; teacherId?: string }[] | undefined) ?? []).find(
    (c) => c.teacherId === teacherId
  );
  const periodsRes = await fetch(`${API}/academic-periods?institutionId=${instA}`, { headers: authHeaders(tokenDir) });
  const periodId = (((await json(periodsRes)).periods as { id: string }[] | undefined) ?? [])[0]?.id;
  if (!classA || !course || !periodId) {
    record('L8-prep', false, 'classe, cours ou période manquant — relancer données métier + RECETTE_* puis recette:lot4');
    process.exitCode = 1;
    return;
  }

  // D’abord une note publiée (preuve positive dans l’export), puis un brouillon
  // créé après — `/grades/publish` publie tout le lot cours×période, donc le
  // brouillon doit arriver en dernier pour rester exclu de l’export.
  const published = await fetch(`${API}/grades`, {
    method: 'POST',
    headers: { ...authHeaders(tokenTeacher), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      studentId,
      courseId: course.id,
      teacherId,
      gradeValue: PUBLISHED_VALUE,
      title: `Publiée recette L8 ${stamp}`,
      description: PUB_MARKER,
      periodId,
    }),
  });
  const publishedBody = await json(published);
  const publishedId = (publishedBody.grade as { id?: string } | undefined)?.id;
  let publishStatus = 0;
  if (publishedId) {
    const pub = await fetch(`${API}/grades/publish`, {
      method: 'POST',
      headers: { ...authHeaders(tokenTeacher), 'Content-Type': 'application/json' },
      body: JSON.stringify({ courseId: course.id, periodId }),
    });
    publishStatus = pub.status;
  }

  const draft = await fetch(`${API}/grades`, {
    method: 'POST',
    headers: { ...authHeaders(tokenTeacher), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      studentId,
      courseId: course.id,
      teacherId,
      gradeValue: DRAFT_VALUE,
      title: `Brouillon recette L8 ${stamp}`,
      description: DRAFT_MARKER,
      periodId,
    }),
  });
  const draftBody = await json(draft);
  const draftId = (draftBody.grade as { id?: string } | undefined)?.id;

  const from = '2020-01-01';
  const to = '2027-12-31';
  const base = `${API}/reports/export?institutionId=${instA}&classId=${classA.id}&startDate=${from}&endDate=${to}`;

  const csvStudents = await fetch(`${base}&type=students&format=csv`, { headers: authHeaders(tokenDir) });
  const csvStudentsText = await csvStudents.text();
  const csvGrades = await fetch(`${base}&type=grades&format=csv`, { headers: authHeaders(tokenDir) });
  const csvGradesText = await csvGrades.text();
  const xlsx = await fetch(`${base}&type=students&format=xlsx`, { headers: authHeaders(tokenDir) });
  const xlsxBuf = Buffer.from(await xlsx.arrayBuffer());
  const pdf = await fetch(`${base}&type=students&format=pdf`, { headers: authHeaders(tokenDir) });
  const pdfBuf = Buffer.from(await pdf.arrayBuffer());

  const csvOk =
    csvStudents.status === 200 &&
    (csvStudents.headers.get('content-type') ?? '').includes('text/csv') &&
    (csvStudents.headers.get('content-disposition') ?? '').includes('attachment') &&
    csvStudentsText.includes('Nom,E-mail,Classe') &&
    csvStudentsText.includes('Koné');
  const gradesOk =
    csvGrades.status === 200 &&
    !!draftId &&
    publishStatus === 200 &&
    !csvGradesText.includes(DRAFT_MARKER) &&
    csvGradesText.includes(PUB_MARKER) &&
    csvGradesText.trim().split('\n').length > 1;
  const xlsxOk =
    xlsx.status === 200 &&
    (xlsx.headers.get('content-type') ?? '').includes('spreadsheetml') &&
    xlsxBuf[0] === 0x50 &&
    xlsxBuf[1] === 0x4b;
  const pdfOk = pdf.status === 200 && pdfBuf.subarray(0, 4).toString() === '%PDF';

  const l81ok = draft.status === 201 && published.status === 201 && csvOk && gradesOk && xlsxOk && pdfOk;
  record(
    'L8-1',
    l81ok,
    l81ok
      ? 'CSV/XLSX/PDF téléchargés ; notes : brouillon exclu, publiée présente'
      : `draft=${draft.status} pub=${published.status}/${publishStatus} csv=${csvStudents.status}/${csvOk} grades=${csvGrades.status}/${gradesOk} xlsx=${xlsx.status}/${xlsxOk} pdf=${pdf.status}/${pdfOk}`
  );

  const analytics = await fetch(`${API}/analytics/dashboard-metrics?institutionId=${instA}`, {
    headers: authHeaders(tokenStudent),
  });
  const l82ok = analytics.status === 403;
  record(
    'L8-2',
    l82ok,
    l82ok ? 'élève refusé sur /analytics/dashboard-metrics (403)' : `analytics=${analytics.status}`
  );

  const failed = steps.filter((s) => !s.ok);
  console.log(`\nLot 8 : ${steps.filter((s) => s.ok).length}/${steps.length} pass`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
