/**
 * Recette locale — Lot 4 (pédagogie : notes, rappels de devoir, observations).
 *
 * Prérequis : API sur :4000, comptes seed (comptes RECETTE_* (env) + données métier).
 *   cd server && npx tsx scripts/recette-lot4.ts
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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const stamp = `${Date.now()}`;

type GradeRow = { id: string; status: string; title?: string; gradeValue?: unknown; previousValue?: unknown };
type ObservationRow = { id: string };
type NotificationRow = { id: string; title?: string; message?: string };
type ComputationRow = { version: number; studentId?: string };

const matchingNotifs = (rows: NotificationRow[], needle: string) =>
  rows.filter((n) => `${n.title ?? ''} ${n.message ?? ''}`.includes(needle));

async function main() {
  const health = await fetch(`${API}/health`);
  if (!health.ok) throw new Error(`API injoignable sur ${API} (${health.status})`);
  const healthBody = (await health.json()) as { databaseTarget?: { profile?: string } };
  console.log(`Cible API ${API} — profil DB : ${healthBody.databaseTarget?.profile ?? '?'}\n`);

  const dirA = await login(getRecetteEmail('school_admin'));
  const teacher = await login(getRecetteEmail('teacher'));
  const student = await login(getRecetteEmail('student'));
  const student2 = await login(getRecetteEmail('student'));
  const parent = await login(getRecetteEmail('parent'));
  const otherTeacher = await login(getRecetteEmail('teacher'));
  const admin = await login(getRecetteEmail('admin'));
  if (
    dirA.status !== 200 ||
    teacher.status !== 200 ||
    student.status !== 200 ||
    student2.status !== 200 ||
    parent.status !== 200 ||
    otherTeacher.status !== 200 ||
    admin.status !== 200
  ) {
    record(
      'L4-prep',
      false,
      `login direction=${dirA.status} enseignant=${teacher.status} élève=${student.status} élève2=${student2.status} parent=${parent.status} prof-principal=${otherTeacher.status} admin=${admin.status}`
    );
    process.exitCode = 1;
    return;
  }

  const tokenDir = dirA.body.token as string;
  const tokenTeacher = teacher.body.token as string;
  const tokenStudent = student.body.token as string;
  const tokenStudent2 = student2.body.token as string;
  const tokenParent = parent.body.token as string;
  const tokenOther = otherTeacher.body.token as string;
  const tokenAdmin = admin.body.token as string;
  const instA = (dirA.body.user as { institutionId?: string }).institutionId;
  const teacherId = (teacher.body.user as { id?: string }).id;
  const studentId = (student.body.user as { id?: string }).id;
  const student2Id = (student2.body.user as { id?: string }).id;
  if (!instA || !teacherId || !studentId || !student2Id) {
    record('L4-prep', false, 'identifiants établissement / enseignant / élèves manquants');
    process.exitCode = 1;
    return;
  }

  const classesRes = await fetch(`${API}/classes?institutionId=${instA}`, { headers: authHeaders(tokenDir) });
  const classA = (((await json(classesRes)).classes as { id: string }[] | undefined) ?? [])[0];
  const coursesRes = await fetch(`${API}/courses?institutionId=${instA}`, { headers: authHeaders(tokenDir) });
  const courses = ((await json(coursesRes)).courses as { id: string; teacherId?: string }[] | undefined) ?? [];
  const course = courses.find((c) => c.teacherId === teacherId);
  const studentsRes = await fetch(`${API}/students`, { headers: authHeaders(tokenDir) });
  const studentsList =
    ((await json(studentsRes)).students as { id: string; profile?: { email?: string } }[] | undefined) ?? [];
  const lea = studentsList.find((s) => s.profile?.email === getRecetteEmail('student')) ?? { id: studentId };
  const noah = studentsList.find((s) => s.profile?.email === getRecetteEmail('student')) ?? { id: student2Id };
  if (!classA || !course) {
    record('L4-prep', false, 'classe ou cours manquant — relancer données métier + RECETTE_*');
    process.exitCode = 1;
    return;
  }

  const periodsRes = await fetch(`${API}/academic-periods?institutionId=${instA}`, { headers: authHeaders(tokenDir) });
  let periods = ((await json(periodsRes)).periods as { id: string }[] | undefined) ?? [];
  let periodId = periods[0]?.id;
  if (!periodId) {
    const createdPeriod = await fetch(`${API}/academic-periods`, {
      method: 'POST',
      headers: { ...authHeaders(tokenDir), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        institutionId: instA,
        academicYear: '2026-2027',
        name: `T1 Recette-${stamp}`,
        order: 1,
        startDate: '2026-09-01',
        endDate: '2027-07-15',
      }),
    });
    const periodBody = await json(createdPeriod);
    periodId = (periodBody.period as { id?: string } | undefined)?.id;
    if (createdPeriod.status !== 201 || !periodId) {
      record('L4-prep', false, `période scolaire introuvable (${createdPeriod.status})`);
      process.exitCode = 1;
      return;
    }
  }

  // L4-1 — brouillon invisible à l'élève, visible après publication
  const gradeTitle = `Recette L4-1 ${stamp}`;
  const createdGrade = await fetch(`${API}/grades`, {
    method: 'POST',
    headers: { ...authHeaders(tokenTeacher), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      studentId: lea.id,
      courseId: course.id,
      teacherId,
      gradeValue: 12,
      title: gradeTitle,
      periodId,
    }),
  });
  const createdGradeBody = await json(createdGrade);
  const gradeId = (createdGradeBody.grade as { id?: string } | undefined)?.id;

  const asStudentDraft = await fetch(`${API}/grades?studentId=${lea.id}`, { headers: authHeaders(tokenStudent) });
  const studentDraftGrades = ((await json(asStudentDraft)).grades as GradeRow[] | undefined) ?? [];
  const draftVisibleToStudent = studentDraftGrades.some((g) => g.id === gradeId || g.title === gradeTitle);

  const asTeacherDraft = await fetch(`${API}/grades?studentId=${lea.id}`, { headers: authHeaders(tokenTeacher) });
  const teacherDraftGrades = ((await json(asTeacherDraft)).grades as GradeRow[] | undefined) ?? [];
  const draftVisibleToTeacher = teacherDraftGrades.some((g) => g.id === gradeId && g.status === 'draft');

  const published = await fetch(`${API}/grades/publish`, {
    method: 'POST',
    headers: { ...authHeaders(tokenTeacher), 'Content-Type': 'application/json' },
    body: JSON.stringify({ courseId: course.id, periodId }),
  });
  const publishedBody = await json(published);

  const asStudentPublished = await fetch(`${API}/grades?studentId=${lea.id}`, { headers: authHeaders(tokenStudent) });
  const studentPublishedGrades = ((await json(asStudentPublished)).grades as GradeRow[] | undefined) ?? [];
  const publishedVisible = studentPublishedGrades.some((g) => g.id === gradeId && g.status === 'published');

  const l41ok =
    createdGrade.status === 201 &&
    !!gradeId &&
    !draftVisibleToStudent &&
    draftVisibleToTeacher &&
    published.status === 200 &&
    Number(publishedBody.published) >= 1 &&
    publishedVisible;
  record(
    'L4-1',
    l41ok,
    l41ok
      ? 'brouillon masqué à l’élève ; visible une fois publié'
      : `create=${createdGrade.status} draftStudent=${draftVisibleToStudent} draftTeacher=${draftVisibleToTeacher} publish=${published.status} count=${publishedBody.published} visible=${publishedVisible}`
  );

  // L4-2 — PATCH refusé, correction conserve l'ancienne valeur, calcul versionné
  const patchPublished = await fetch(`${API}/grades/${gradeId}`, {
    method: 'PATCH',
    headers: { ...authHeaders(tokenTeacher), 'Content-Type': 'application/json' },
    body: JSON.stringify({ gradeValue: 20 }),
  });
  const corrected = await fetch(`${API}/grades/${gradeId}/correct`, {
    method: 'POST',
    headers: { ...authHeaders(tokenTeacher), 'Content-Type': 'application/json' },
    body: JSON.stringify({ gradeValue: 18 }),
  });
  const correctedBody = await json(corrected);
  const correctedGrade = (correctedBody.grade as GradeRow | undefined) ?? { id: '', status: '' };

  const compute1 = await fetch(`${API}/grades/compute`, {
    method: 'POST',
    headers: { ...authHeaders(tokenDir), 'Content-Type': 'application/json' },
    body: JSON.stringify({ classId: classA.id, periodId }),
  });
  const compute1Body = await json(compute1);
  const v1 = (((compute1Body.computations as ComputationRow[] | undefined) ?? [])[0]?.version) ?? 0;

  const compute2 = await fetch(`${API}/grades/compute`, {
    method: 'POST',
    headers: { ...authHeaders(tokenDir), 'Content-Type': 'application/json' },
    body: JSON.stringify({ classId: classA.id, periodId }),
  });
  const compute2Body = await json(compute2);
  const v2 = (((compute2Body.computations as ComputationRow[] | undefined) ?? [])[0]?.version) ?? 0;

  const l42ok =
    patchPublished.status === 409 &&
    corrected.status === 200 &&
    correctedGrade.status === 'corrected' &&
    Number(correctedGrade.previousValue) === 12 &&
    Number(correctedGrade.gradeValue) === 18 &&
    compute1.status === 201 &&
    compute2.status === 201 &&
    v1 > 0 &&
    v2 === v1 + 1;
  record(
    'L4-2',
    l42ok,
    l42ok
      ? `PATCH 409 ; correction 12→18 avec previousValue ; calcul v${v1} puis v${v2}`
      : `patch=${patchPublished.status} correct=${corrected.status} prev=${correctedGrade.previousValue} val=${correctedGrade.gradeValue} status=${correctedGrade.status} compute=${compute1.status}/${compute2.status} v=${v1}->${v2}`
  );

  // L4-3 — rappel uniquement aux non-rendus, pas de doublon
  const assignmentTitle = `Recette L4-3 ${stamp}`;
  const dueDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const createdAssignment = await fetch(`${API}/assignments`, {
    method: 'POST',
    headers: { ...authHeaders(tokenTeacher), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      courseId: course.id,
      teacherId,
      title: assignmentTitle,
      dueDate,
    }),
  });
  const assignmentBody = await json(createdAssignment);
  const assignmentId = (assignmentBody.assignment as { id?: string } | undefined)?.id;

  await sleep(400);

  const submitted = await fetch(`${API}/assignments/submissions`, {
    method: 'POST',
    headers: { ...authHeaders(tokenStudent2), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      assignmentId,
      studentId: noah.id,
      content: 'Rendu recette L4-3',
    }),
  });

  const notifsOf = async (userId: string) => {
    const res = await fetch(`${API}/notifications?userId=${userId}`, { headers: authHeaders(tokenDir) });
    return ((await json(res)).notifications as NotificationRow[] | undefined) ?? [];
  };

  const leaBefore = matchingNotifs(await notifsOf(lea.id), assignmentTitle).length;

  const check1 = await fetch(`${API}/assignments/reminder-check`, {
    method: 'POST',
    headers: authHeaders(tokenAdmin),
  });
  const check1Body = await json(check1);

  const leaAfter = matchingNotifs(await notifsOf(lea.id), assignmentTitle);
  const noahAfter = matchingNotifs(await notifsOf(noah.id), assignmentTitle);
  const parentAfter = matchingNotifs(await notifsOf((parent.body.user as { id: string }).id), assignmentTitle);
  const leaOverdue = leaAfter.filter((n) => (n.title ?? '').includes('retard') || (n.message ?? '').includes('en retard'));
  const noahOverdue = noahAfter.filter((n) => (n.title ?? '').includes('retard') || (n.message ?? '').includes('en retard'));
  const parentOverdue = parentAfter.filter((n) => (n.title ?? '').includes('retard') || (n.message ?? '').includes('en retard'));

  const check2 = await fetch(`${API}/assignments/reminder-check`, {
    method: 'POST',
    headers: authHeaders(tokenAdmin),
  });
  const leaAgain = matchingNotifs(await notifsOf(lea.id), assignmentTitle).length;
  const parentAgain = matchingNotifs(await notifsOf((parent.body.user as { id: string }).id), assignmentTitle).length;

  const l43ok =
    createdAssignment.status === 201 &&
    !!assignmentId &&
    (submitted.status === 201 || submitted.status === 200) &&
    check1.status === 200 &&
    Number(check1Body.remindersSent) >= 1 &&
    leaOverdue.length >= 1 &&
    leaAfter.length > leaBefore &&
    noahOverdue.length === 0 &&
    parentOverdue.length >= 1 &&
    check2.status === 200 &&
    leaAgain === leaAfter.length &&
    parentAgain === parentAfter.length;
  record(
    'L4-3',
    l43ok,
    l43ok
      ? 'rappel retard à l’élève non rendu + parent ; élève ayant rendu épargné ; pas de doublon'
      : `assign=${createdAssignment.status} submit=${submitted.status} check=${check1.status} sent=${check1Body.remindersSent} leaOverdue=${leaOverdue.length} noahOverdue=${noahOverdue.length} parentOverdue=${parentOverdue.length} lea=${leaBefore}->${leaAfter.length}->${leaAgain}`
  );

  // L4-4 — observation confidentielle : autre enseignant et famille exclus, direction voit ; partage famille ensuite
  const obsTitle = `Recette L4-4 ${stamp}`;
  const createdObs = await fetch(`${API}/observations`, {
    method: 'POST',
    headers: { ...authHeaders(tokenTeacher), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      studentId: lea.id,
      category: 'neutral',
      title: obsTitle,
      description: 'Note interne recette — confidentielle',
      restrictedToUserIds: [teacherId],
      visibleToFamily: false,
    }),
  });
  const obsBody = await json(createdObs);
  const observationId = (obsBody.observation as { id?: string } | undefined)?.id;

  const listFor = async (token: string) => {
    const res = await fetch(`${API}/observations?studentId=${lea.id}`, { headers: authHeaders(token) });
    const rows = ((await json(res)).observations as ObservationRow[] | undefined) ?? [];
    return { status: res.status, visible: rows.some((o) => o.id === observationId) };
  };

  const asAuthor = await listFor(tokenTeacher);
  const asOther = await listFor(tokenOther);
  const asDir = await listFor(tokenDir);
  const asParentBefore = await listFor(tokenParent);

  const shared = await fetch(`${API}/observations/${observationId}`, {
    method: 'PATCH',
    headers: { ...authHeaders(tokenTeacher), 'Content-Type': 'application/json' },
    body: JSON.stringify({ visibleToFamily: true }),
  });
  const asParentAfter = await listFor(tokenParent);

  const l44ok =
    createdObs.status === 201 &&
    !!observationId &&
    asAuthor.visible &&
    !asOther.visible &&
    asDir.visible &&
    !asParentBefore.visible &&
    shared.status === 200 &&
    asParentAfter.visible;
  record(
    'L4-4',
    l44ok,
    l44ok
      ? 'confidentielle : autre enseignant et parent exclus ; direction voit ; partage famille OK'
      : `create=${createdObs.status} author=${asAuthor.visible} other=${asOther.visible} dir=${asDir.visible} parent=${asParentBefore.visible}->${asParentAfter.visible} share=${shared.status}`
  );

  const failed = steps.filter((s) => !s.ok);
  console.log(`\nLot 4 : ${steps.filter((s) => s.ok).length}/${steps.length} pass`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
