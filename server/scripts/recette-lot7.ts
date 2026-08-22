/**
 * Recette locale — Lot 7 (documents : certificat, bulletin versionné, révocation).
 *
 * Prérequis : API sur :4000, comptes seed (comptes RECETTE_* (env) + données métier).
 *   cd server && npx tsx scripts/recette-lot7.ts
 *
 * S3 non requis : le PDF est régénéré à la volée depuis `dataSnapshot`.
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

type Doc = {
  id: string;
  type: string;
  version: number;
  status: string;
  verificationToken: string;
  generatedAt?: string;
  dataSnapshot?: { overallAverage?: number };
};
type Computation = { version: number; subjectId?: string | null; average?: unknown };

async function main() {
  const health = await fetch(`${API}/health`);
  if (!health.ok) throw new Error(`API injoignable sur ${API} (${health.status})`);
  const healthBody = (await health.json()) as { databaseTarget?: { profile?: string } };
  console.log(`Cible API ${API} — profil DB : ${healthBody.databaseTarget?.profile ?? '?'}\n`);

  const dir = await login(getRecetteEmail('school_admin'));
  const teacher = await login(getRecetteEmail('teacher'));
  const student = await login(getRecetteEmail('student'));
  if (dir.status !== 200 || teacher.status !== 200 || student.status !== 200) {
    record('L7-prep', false, `login direction=${dir.status} enseignant=${teacher.status} élève=${student.status}`);
    process.exitCode = 1;
    return;
  }

  const tokenDir = dir.body.token as string;
  const tokenTeacher = teacher.body.token as string;
  const instA = (dir.body.user as { institutionId?: string }).institutionId;
  const teacherId = (teacher.body.user as { id?: string }).id;
  const studentId = (student.body.user as { id?: string }).id;
  if (!instA || !teacherId || !studentId) {
    record('L7-prep', false, 'identifiants établissement / enseignant / élève manquants');
    process.exitCode = 1;
    return;
  }

  const postJson = async (token: string, path: string, body: unknown) => {
    const res = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await json(res) };
  };

  const studentsRes = await fetch(`${API}/students`, { headers: authHeaders(tokenDir) });
  const students =
    ((await json(studentsRes)).students as { id: string; classId?: string; profile?: { email?: string } }[] | undefined) ??
    [];
  const lea = students.find((s) => s.profile?.email === getRecetteEmail('student')) ?? { id: studentId, classId: undefined };
  const classesRes = await fetch(`${API}/classes?institutionId=${instA}`, { headers: authHeaders(tokenDir) });
  const classA = (((await json(classesRes)).classes as { id: string }[] | undefined) ?? [])[0];
  const classId = lea.classId ?? classA?.id;
  const coursesRes = await fetch(`${API}/courses?institutionId=${instA}`, { headers: authHeaders(tokenDir) });
  const course = (((await json(coursesRes)).courses as { id: string; teacherId?: string }[] | undefined) ?? []).find(
    (c) => c.teacherId === teacherId
  );
  if (!classId || !course) {
    record('L7-prep', false, 'classe ou cours manquant — relancer données métier + RECETTE_*');
    process.exitCode = 1;
    return;
  }

  // L7-1 — certificat PDF + QR public
  const cert1 = await postJson(tokenDir, '/documents/enrollment-certificate', { studentId: lea.id });
  const doc1 = cert1.body.document as Doc | undefined;
  const download1 = doc1
    ? await fetch(`${API}/documents/${doc1.id}/download`, { headers: authHeaders(tokenDir) })
    : null;
  const pdfHead = download1 ? Buffer.from(await download1.arrayBuffer()).subarray(0, 5).toString() : '';
  const verify1 = doc1 ? await fetch(`${API}/documents/verify/${doc1.verificationToken}`) : null;
  const verify1Body = verify1 ? await json(verify1) : {};

  const l71ok =
    cert1.status === 201 &&
    doc1?.type === 'enrollment_certificate' &&
    download1?.status === 200 &&
    pdfHead === '%PDF-' &&
    verify1?.status === 200 &&
    verify1Body.valid === true &&
    verify1Body.type === 'enrollment_certificate' &&
    typeof verify1Body.institution === 'string' &&
    !!verify1Body.institution &&
    !!verify1Body.generatedAt &&
    (verify1Body.status === 'generated' || verify1Body.valid === true);
  record(
    'L7-1',
    l71ok,
    l71ok
      ? `certificat v${doc1?.version} PDF + QR public (émetteur, type, date, statut)`
      : `create=${cert1.status} pdf=${download1?.status}/${pdfHead} verify=${verify1?.status} valid=${verify1Body.valid} type=${verify1Body.type}`
  );

  // L7-2 — bulletin = dernier calcul versionné, pas un recalcul à la volée
  const periodsRes = await fetch(`${API}/academic-periods?institutionId=${instA}`, { headers: authHeaders(tokenDir) });
  let periods = ((await json(periodsRes)).periods as { id: string }[] | undefined) ?? [];
  let periodId = periods[0]?.id;
  if (!periodId) {
    const created = await postJson(tokenDir, '/academic-periods', {
      institutionId: instA,
      academicYear: '2026-2027',
      name: `T1 Docs-${stamp}`,
      order: 1,
      startDate: '2026-09-01',
      endDate: '2027-07-15',
    });
    periodId = (created.body.period as { id?: string } | undefined)?.id;
  }

  const ensureCompute = async () => {
    const compute = await postJson(tokenDir, '/grades/compute', { classId, periodId });
    if (compute.status === 201) return compute;
    const gradesRes = await fetch(`${API}/grades?studentId=${lea.id}`, { headers: authHeaders(tokenTeacher) });
    const grades = ((await json(gradesRes)).grades as { id: string; status: string; courseId: string }[] | undefined) ?? [];
    const hasPublished = grades.some((g) => g.status === 'published' || g.status === 'corrected');
    if (!hasPublished) {
      await postJson(tokenTeacher, '/grades', {
        studentId: lea.id,
        courseId: course.id,
        teacherId,
        gradeValue: 14,
        title: `Recette L7-2 ${stamp}`,
        periodId,
      });
      await postJson(tokenTeacher, '/grades/publish', { courseId: course.id, periodId });
    }
    return postJson(tokenDir, '/grades/compute', { classId, periodId });
  };

  const firstCompute = await ensureCompute();
  const compsRes = await fetch(
    `${API}/grades/computations?classId=${classId}&periodId=${periodId}&studentId=${lea.id}`,
    { headers: authHeaders(tokenDir) }
  );
  const comps = ((await json(compsRes)).computations as Computation[] | undefined) ?? [];
  const overall = comps.find((c) => c.subjectId == null);
  const computedAvg = Number(overall?.average);

  const bulletin1 = await postJson(tokenDir, '/documents/report-card', { studentId: lea.id, periodId });
  const snap1 = (bulletin1.body.document as Doc | undefined)?.dataSnapshot;
  const avg1 = Number(snap1?.overallAverage);

  const gradesRes = await fetch(`${API}/grades?studentId=${lea.id}`, { headers: authHeaders(tokenTeacher) });
  const editable =
    (((await json(gradesRes)).grades as { id: string; status: string; courseId?: string; gradeValue?: unknown }[] | undefined) ?? []).find(
      (g) => (g.status === 'published' || g.status === 'corrected') && g.courseId === course.id
    );
  const currentValue = Number(editable?.gradeValue);
  const nextValue = currentValue >= 12 ? 3 : 19;
  const corrected = editable
    ? await postJson(tokenTeacher, `/grades/${editable.id}/correct`, { gradeValue: nextValue })
    : { status: 0, body: {} };

  const bulletin2 = await postJson(tokenDir, '/documents/report-card', { studentId: lea.id, periodId });
  const avg2 = Number((bulletin2.body.document as Doc | undefined)?.dataSnapshot?.overallAverage);

  const afterCompute = await postJson(tokenDir, '/grades/compute', { classId, periodId });
  const bulletin3 = await postJson(tokenDir, '/documents/report-card', { studentId: lea.id, periodId });
  const avg3 = Number((bulletin3.body.document as Doc | undefined)?.dataSnapshot?.overallAverage);

  const l72ok =
    !!periodId &&
    firstCompute.status === 201 &&
    bulletin1.status === 201 &&
    Number.isFinite(computedAvg) &&
    Math.abs(avg1 - computedAvg) < 0.05 &&
    corrected.status === 200 &&
    bulletin2.status === 201 &&
    avg2 === avg1 &&
    afterCompute.status === 201 &&
    bulletin3.status === 201 &&
    avg3 !== avg1;
  record(
    'L7-2',
    l72ok,
    l72ok
      ? `bulletin moyenne ${avg1} inchangée après correction (sans compute) ; ${avg3} après nouveau calcul`
      : `period=${periodId} compute=${firstCompute.status} b1=${bulletin1.status} avg=${computedAvg}/${avg1}/${avg2}/${avg3} correct=${corrected.status}`
  );

  // L7-3 — régénération (nouvelle version, ancienne conservée) puis révocation du QR
  const cert2 = await postJson(tokenDir, '/documents/enrollment-certificate', { studentId: lea.id });
  const doc2 = cert2.body.document as Doc | undefined;
  const versionsRes = doc1
    ? await fetch(`${API}/documents/${doc1.id}/versions`, { headers: authHeaders(tokenDir) })
    : null;
  const versions = versionsRes ? (((await json(versionsRes)).versions as { version: number; id: string }[] | undefined) ?? []) : [];
  const versionNumbers = versions.map((v) => v.version).sort((a, b) => a - b);
  const oldStillThere = doc1 ? versionNumbers.includes(doc1.version) : false;
  const newPresent = doc2 ? versionNumbers.includes(doc2.version) : false;

  const revoke = doc2 ? await postJson(tokenDir, `/documents/${doc2.id}/revoke`, {}) : { status: 0, body: {} };
  const verifyNew = doc2 ? await fetch(`${API}/documents/verify/${doc2.verificationToken}`) : null;
  const verifyNewBody = verifyNew ? await json(verifyNew) : {};
  const verifyOld = doc1 ? await fetch(`${API}/documents/verify/${doc1.verificationToken}`) : null;
  const verifyOldBody = verifyOld ? await json(verifyOld) : {};

  const l73ok =
    cert2.status === 201 &&
    !!doc2 &&
    !!doc1 &&
    doc2.version > doc1.version &&
    oldStillThere &&
    newPresent &&
    versionNumbers.length >= 2 &&
    revoke.status === 200 &&
    verifyNewBody.valid === false &&
    verifyNewBody.status === 'revoked' &&
    verifyOldBody.valid === true;
  record(
    'L7-3',
    l73ok,
    l73ok
      ? `v${doc1?.version} conservée (QR valide) ; v${doc2?.version} révoquée (QR invalidé)`
      : `regen=${cert2.status} v=${doc1?.version}->${doc2?.version} versions=${versionNumbers.join(',')} revoke=${revoke.status} newQR=${verifyNewBody.valid}/${verifyNewBody.status} oldQR=${verifyOldBody.valid}`
  );

  const failed = steps.filter((s) => !s.ok);
  console.log(`\nLot 7 : ${steps.filter((s) => s.ok).length}/${steps.length} pass`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
