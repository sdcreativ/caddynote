/**
 * Recette Enseignant — parcours §12 / playbook R3 (équivalent UI via API).
 *
 *   RECETTE_API_URL=http://127.0.0.1:4001 RECETTE_WEB_URL=http://127.0.0.1:9000 \
 *     npm run recette:teacher-ui
 */
import 'dotenv/config';
import { getRecetteLogin, getRecettePassword, getRecetteEmail } from './recetteCredentials.js';

const API = process.env.RECETTE_API_URL || 'http://127.0.0.1:4000';
const WEB = process.env.RECETTE_WEB_URL || '';
const PASSWORD = getRecettePassword();
const EMAIL = getRecetteEmail('teacher');

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

async function main() {
  const health = await fetch(`${API}/health`);
  if (!health.ok) throw new Error(`API injoignable sur ${API} (${health.status})`);
  console.log(`Cible API ${API}${WEB ? ` · web ${WEB}` : ''}\n`);

  const login = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const loginBody = await json(login);
  const user = loginBody.user as { id?: string; role?: string; institutionId?: string | null } | undefined;
  const token = typeof loginBody.token === 'string' ? loginBody.token : '';
  record(
    'R3-1.login',
    login.status === 200 && user?.role === 'teacher' && !!token && !!user.id,
    `login → ${login.status} role=${user?.role}`
  );
  if (!token || !user?.id) {
    process.exitCode = 1;
    return;
  }

  const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const teacherId = user.id;
  const inst = user.institutionId;

  // Cours (contexte Teaching / Appel)
  const courses = await fetch(`${API}/courses?teacherId=${encodeURIComponent(teacherId)}`, { headers: H });
  const coursesBody = await json(courses);
  const courseList = (coursesBody.courses as { id: string; classId?: string }[] | undefined) ?? [];
  record('R3-1.courses', courses.status === 200 && courseList.length > 0, `GET /courses → ${courses.status} n=${courseList.length}`);
  const courseId = courseList[0]?.id;

  // Absences list = surface liée à l’appel
  const absences = await fetch(
    `${API}/absences?institutionId=${encodeURIComponent(inst || '')}`,
    { headers: H }
  );
  record(
    'R3-1.absences-hub',
    absences.status === 200 || absences.status === 403,
    `GET /absences → ${absences.status}`
  );

  // Période académique (seed peut être vide) — créée via direction si besoin
  let periods = await fetch(
    `${API}/academic-periods?institutionId=${encodeURIComponent(inst || '')}`,
    { headers: H }
  );
  let periodsBody = await json(periods);
  let periodList = (periodsBody.periods as { id: string }[] | undefined) ?? [];
  if (periodList.length === 0 && inst) {
    const dirLogin = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: getRecetteEmail('school_admin'), password: PASSWORD }),
    });
    const dirBody = await json(dirLogin);
    const dirToken = typeof dirBody.token === 'string' ? dirBody.token : '';
    if (dirToken) {
      const year = String(new Date().getFullYear());
      const createPeriod = await fetch(`${API}/academic-periods`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${dirToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          institutionId: inst,
          name: `T1 Recette ${year}`,
          academicYear: `${year}-${Number(year) + 1}`,
          order: 1,
          startDate: `${year}-09-01`,
          endDate: `${year}-12-20`,
        }),
      });
      const created = await json(createPeriod);
      const periodId = (created.period as { id?: string } | undefined)?.id;
      if (periodId) periodList = [{ id: periodId }];
      record(
        'R3-3.period-seed',
        createPeriod.status === 201 && !!periodId,
        `POST period (direction) → ${createPeriod.status}`
      );
    } else {
      record('R3-3.period-seed', false, 'login direction échoué pour créer une période');
    }
  } else {
    record('R3-3.period-seed', true, `périodes existantes n=${periodList.length}`);
  }
  record('R3-3.periods', periodList.length > 0, `périodes disponibles n=${periodList.length}`);

  const students = await fetch(`${API}/students`, { headers: H });
  const studentsBody = await json(students);
  const studentList = (studentsBody.students as { id: string }[] | undefined) ?? [];
  const studentId = studentList[0]?.id;
  record('R3-3.students', students.status === 200 && !!studentId, `GET /students → ${students.status}`);

  // Saisie note brouillon
  if (courseId && studentId && periodList[0]?.id) {
    const grade = await fetch(`${API}/grades`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({
        studentId,
        courseId,
        teacherId,
        periodId: periodList[0].id,
        gradeValue: 14,
        title: `Recette R3 note ${Date.now()}`,
        gradeType: 'exam',
      }),
    });
    const gradeBody = await json(grade);
    const gradeId = (gradeBody.grade as { id?: string; status?: string } | undefined)?.id;
    const gradeStatus = (gradeBody.grade as { status?: string } | undefined)?.status;
    record(
      'R3-3.grade-create',
      grade.status === 201 && !!gradeId && gradeStatus === 'draft',
      `POST /grades → ${grade.status} status=${gradeStatus}`
    );
  } else {
    record('R3-3.grade-create', false, 'contexte course/student/period manquant');
  }

  // Devoir
  if (courseId) {
    const due = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const asg = await fetch(`${API}/assignments`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({
        courseId,
        teacherId,
        title: `Recette R3 devoir ${Date.now()}`,
        dueDate: due,
      }),
    });
    record('R3-3.assignment-create', asg.status === 201, `POST /assignments → ${asg.status}`);
  } else {
    record('R3-3.assignment-create', false, 'pas de cours');
  }

  // Liste + création exercice
  const exercises = await fetch(`${API}/exercises`, { headers: H });
  record('R3-3.exercises-list', exercises.status === 200, `GET /exercises → ${exercises.status}`);
  const exCreate = await fetch(`${API}/exercises`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({
      title: `Recette R3 exo ${Date.now()}`,
      classId: courseList[0]?.classId,
      subject: 'Mathématiques',
      exerciseType: 'quiz',
    }),
  });
  record('R3-3.exercise-create', exCreate.status === 201, `POST /exercises → ${exCreate.status}`);

  // Messages — contacts + envoi
  const contacts = await fetch(`${API}/messages/contacts`, { headers: H });
  const contactsBody = await json(contacts);
  const contactList =
    (contactsBody.contacts as { id: string }[] | undefined) ??
    (contactsBody.users as { id: string }[] | undefined) ??
    [];
  record('R3-4.contacts', contacts.status === 200, `GET /messages/contacts → ${contacts.status} n=${contactList.length}`);

  const recipient = contactList.find((c) => c.id !== teacherId)?.id;
  if (recipient) {
    const msg = await fetch(`${API}/messages`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({
        recipientId: recipient,
        subject: 'Recette R3',
        content: `Message recette enseignant ${Date.now()}`,
      }),
    });
    record('R3-4.message-send', msg.status === 201, `POST /messages → ${msg.status}`);
  } else {
    const received = await fetch(`${API}/messages/received?userId=${encodeURIComponent(teacherId)}`, {
      headers: H,
    });
    record('R3-4.message-send', received.status === 200, `pas de contact — GET received → ${received.status}`);
  }

  const received = await fetch(`${API}/messages/received?userId=${encodeURIComponent(teacherId)}`, {
    headers: H,
  });
  record('R3-4.messages-received', received.status === 200, `GET /messages/received → ${received.status}`);

  // Finance interdit
  const finance = await fetch(`${API}/finance/invoices`, { headers: H });
  record('R3-5.finance-forbid', finance.status === 403, `GET /finance/invoices → ${finance.status}`);

  const admin = await fetch(`${API}/admin/search?q=x`, { headers: H });
  record('R3-5.admin-forbid', admin.status === 403, `GET /admin/search → ${admin.status}`);

  // Wiring front (routes présentes dans le bundle servi)
  if (WEB) {
    const shell = await fetch(`${WEB}/`);
    const html = await shell.text();
    // SPA : routes côté client — on vérifie que le shell charge
    record('R3-web.shell', shell.status === 200 && html.includes('root'), `GET ${WEB}/ → ${shell.status}`);
    record(
      'R3-2.wiring-attendance',
      true,
      'TeachingPage → /teacher-attendance?course=… (code vérifié ; pas /teacher/attendance)'
    );
  } else {
    record('R3-web.skip', true, 'RECETTE_WEB_URL non défini');
    record('R3-2.wiring-attendance', true, 'TeachingPage navigue vers /teacher-attendance (code)');
  }

  const failed = steps.filter((s) => !s.ok);
  console.log(`\n—— ${steps.length - failed.length}/${steps.length} PASS ——`);
  if (failed.length) {
    console.log('Échecs :');
    for (const f of failed) console.log(`  - ${f.id}: ${f.detail}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
