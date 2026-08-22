/**
 * Recette School admin / Direction — parcours §12 / playbook R2 (équivalent UI via API).
 *
 *   cd server && variables RECETTE_*
 *   RECETTE_API_URL=http://127.0.0.1:4001 RECETTE_WEB_URL=http://127.0.0.1:9000 npm run recette:school-admin-ui
 */
import 'dotenv/config';
import { getRecetteLogin, getRecettePassword, getRecetteEmail } from './recetteCredentials.js';

const API = process.env.RECETTE_API_URL || 'http://127.0.0.1:4000';
const WEB = process.env.RECETTE_WEB_URL || '';
const PASSWORD = getRecettePassword();
const EMAIL = getRecetteEmail('school_admin');

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
    'R2-1.login',
    login.status === 200 && user?.role === 'school_admin' && !!token && !!user.institutionId,
    `login → ${login.status} role=${user?.role} institution=${user?.institutionId}`
  );
  if (!token || !user?.institutionId) {
    process.exitCode = 1;
    return;
  }

  const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const inst = user.institutionId;

  // Dashboard établissement (KPI)
  const metrics = await fetch(
    `${API}/analytics/dashboard-metrics?institutionId=${encodeURIComponent(inst)}`,
    { headers: H }
  );
  record('R2-1.dashboard-metrics', metrics.status === 200, `GET dashboard-metrics → ${metrics.status}`);

  // Élèves — liste + fiche
  const students = await fetch(`${API}/students`, { headers: H });
  const studentsBody = await json(students);
  const studentList = (studentsBody.students as { id: string; profile?: { firstName?: string } }[] | undefined) ?? [];
  record('R2-2.students-list', students.status === 200 && studentList.length > 0, `GET /students → ${students.status} n=${studentList.length}`);
  const studentId = studentList[0]?.id;
  if (studentId) {
    const one = await fetch(`${API}/students/${studentId}`, { headers: H });
    record('R2-2.student-detail', one.status === 200, `GET /students/${studentId} → ${one.status}`);
  } else {
    record('R2-2.student-detail', false, 'aucun élève seed');
  }

  // Classes — liste + créer + patch + delete cleanup
  const classes = await fetch(`${API}/classes?institutionId=${encodeURIComponent(inst)}`, { headers: H });
  const classesBody = await json(classes);
  const classList = (classesBody.classes as { id: string }[] | undefined) ?? [];
  record('R2-3.classes-list', classes.status === 200, `GET /classes → ${classes.status} n=${classList.length}`);

  const stamp = Date.now();
  const createClass = await fetch(`${API}/classes`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ name: `Recette R2 ${stamp}`, institutionId: inst }),
  });
  const createClassBody = await json(createClass);
  const newClassId = (createClassBody.class as { id?: string } | undefined)?.id
    ?? (createClassBody as { id?: string }).id;
  record(
    'R2-3.class-create',
    createClass.status === 201 && !!newClassId,
    `POST /classes → ${createClass.status} id=${newClassId}`
  );
  if (newClassId) {
    const patch = await fetch(`${API}/classes/${newClassId}`, {
      method: 'PATCH',
      headers: H,
      body: JSON.stringify({ name: `Recette R2 ${stamp} edit` }),
    });
    record('R2-3.class-edit', patch.status === 200, `PATCH /classes/:id → ${patch.status}`);
    const del = await fetch(`${API}/classes/${newClassId}`, { method: 'DELETE', headers: H });
    record('R2-3.class-cleanup', del.status === 200 || del.status === 204, `DELETE /classes/:id → ${del.status}`);
  }

  // Créer enseignant + élève (users) puis cleanup soft si possible
  const teacherEmail = `recette.teacher.${stamp}@recette.local`;
  const createTeacher = await fetch(`${API}/users`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({
      email: teacherEmail,
      role: 'teacher',
      firstName: 'Recette',
      lastName: 'Enseignant',
      institutionId: inst,
    }),
  });
  const teacherBody = await json(createTeacher);
  const teacherId = (teacherBody.user as { id?: string } | undefined)?.id;
  record(
    'R2-3.teacher-create',
    createTeacher.status === 201 && !!teacherId,
    `POST /users teacher → ${createTeacher.status}`
  );

  const studentEmail = `recette.student.${stamp}@recette.local`;
  const createStudent = await fetch(`${API}/users`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({
      email: studentEmail,
      role: 'student',
      firstName: 'Recette',
      lastName: 'Eleve',
      institutionId: inst,
    }),
  });
  const studentBody = await json(createStudent);
  const newStudentId = (studentBody.user as { id?: string } | undefined)?.id;
  record(
    'R2-3.student-create',
    createStudent.status === 201 && !!newStudentId,
    `POST /users student → ${createStudent.status}`
  );

  // Lecture absences + notes + finance + admissions
  const absences = await fetch(`${API}/absences?institutionId=${encodeURIComponent(inst)}`, { headers: H });
  record('R2-4.absences', absences.status === 200, `GET /absences → ${absences.status}`);

  const gradesPath = studentId
    ? `/grades?studentId=${encodeURIComponent(studentId)}`
    : `/grades?institutionId=${encodeURIComponent(inst)}`;
  const grades = await fetch(`${API}${gradesPath}`, { headers: H });
  record('R2-4.grades', grades.status === 200, `GET ${gradesPath} → ${grades.status}`);

  const finance = await fetch(`${API}/finance/invoices?institutionId=${encodeURIComponent(inst)}`, { headers: H });
  record('R2-5.finance', finance.status === 200, `GET /finance/invoices → ${finance.status}`);

  const admissions = await fetch(`${API}/admissions?institutionId=${encodeURIComponent(inst)}`, { headers: H });
  record('R2-6.admissions', admissions.status === 200, `GET /admissions → ${admissions.status}`);

  // Freeze réservé admin global
  const freeze = await fetch(`${API}/institutions/${inst}/freeze`, {
    method: 'POST',
    headers: H,
    body: '{}',
  });
  record('R2-7.freeze-forbid', freeze.status === 403, `POST freeze → ${freeze.status} (403 attendu)`);

  // Admin ops interdit
  const adminForbid = await fetch(`${API}/admin/billing-metrics`, { headers: H });
  record('R2-7.admin-forbid', adminForbid.status === 403, `GET /admin/billing-metrics → ${adminForbid.status}`);

  if (WEB) {
    // Shell SPA : prouve que les routes direction répondent (index.html) — look & feel = § R2-LF
    for (const [id, path] of [
      ['R2-web.sign', '/sign'],
      ['R2-web.root', '/'],
      ['R2-web.dashboard', '/dashboard'],
      ['R2-web.students', '/students'],
      ['R2-web.classes', '/classes'],
      ['R2-web.absences', '/absences'],
      ['R2-web.grades', '/grades'],
      ['R2-web.finance', '/finance'],
      ['R2-web.admissions', '/admissions/admin'],
      ['R2-web.subjects', '/subjects'],
      ['R2-web.settings', '/settings'],
    ] as const) {
      const res = await fetch(`${WEB}${path}`, { redirect: 'manual' });
      record(
        id,
        res.status === 200 || (res.status >= 300 && res.status < 400),
        `GET ${WEB}${path} → ${res.status}`
      );
    }
  } else {
    record('R2-web.skip', true, 'RECETTE_WEB_URL non défini — shell SPA non sondé');
  }

  const failed = steps.filter((s) => !s.ok);
  console.log(`\n—— ${steps.length - failed.length}/${steps.length} PASS ——`);
  if (failed.length) {
    console.log('Échecs :');
    for (const f of failed) console.log(`  - ${f.id}: ${f.detail}`);
    process.exitCode = 1;
  } else {
    console.log(`
Look & feel navigateur (optionnel, humain) — § R2-LF :
  direction@recette.local → dashboard KPI, nav Direction, empty states, mobile
  Détail : docs/RECETTE_HAPPY_PATH_ROLES.md § R2-LF
`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
