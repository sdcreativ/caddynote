/**
 * Recette locale — Lot 3 (emploi du temps, appel hors ligne, seuils).
 *
 * Prérequis : API sur :4000, comptes seed (comptes RECETTE_* (env) + données métier).
 *   cd server && npx tsx scripts/recette-lot3.ts
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

async function main() {
  const health = await fetch(`${API}/health`);
  if (!health.ok) throw new Error(`API injoignable sur ${API} (${health.status})`);
  const healthBody = (await health.json()) as { databaseTarget?: { profile?: string } };
  console.log(`Cible API ${API} — profil DB : ${healthBody.databaseTarget?.profile ?? '?'}\n`);

  const dirA = await login(getRecetteEmail('school_admin'));
  const teacher = await login(getRecetteEmail('teacher'));
  const admin = await login(getRecetteEmail('admin'));
  if (dirA.status !== 200 || teacher.status !== 200 || admin.status !== 200) {
    record('L3-prep', false, `login direction=${dirA.status} enseignant=${teacher.status} admin=${admin.status}`);
    process.exitCode = 1;
    return;
  }
  const tokenDir = dirA.body.token as string;
  const tokenTeacher = teacher.body.token as string;
  const tokenAdmin = admin.body.token as string;
  const instA = (dirA.body.user as { institutionId?: string }).institutionId;
  const teacherId = (teacher.body.user as { id?: string }).id;
  const directionId = (dirA.body.user as { id?: string }).id;
  if (!instA || !teacherId || !directionId) {
    record('L3-prep', false, 'identifiants établissement / enseignant manquants');
    process.exitCode = 1;
    return;
  }

  const classesRes = await fetch(`${API}/classes?institutionId=${instA}`, { headers: authHeaders(tokenDir) });
  const classA = (((await json(classesRes)).classes as { id: string }[] | undefined) ?? [])[0];
  const coursesRes = await fetch(`${API}/courses?institutionId=${instA}`, { headers: authHeaders(tokenDir) });
  const courses = ((await json(coursesRes)).courses as { id: string; teacherId?: string }[] | undefined) ?? [];
  const teacherCourses = courses.filter((c) => c.teacherId === teacherId);
  const course1 = teacherCourses[0];
  const course2 = teacherCourses[1] ?? teacherCourses[0];
  const studentsRes = await fetch(`${API}/students`, { headers: authHeaders(tokenDir) });
  const studentA = (((await json(studentsRes)).students as { id: string }[] | undefined) ?? [])[0];
  if (!classA || !course1 || !studentA) {
    record('L3-prep', false, 'classe, cours ou élève manquant — relancer données métier + RECETTE_*');
    process.exitCode = 1;
    return;
  }

  // L3-1 — conflit enseignant, puis force + audit
  // Créneaux dérivés du stamp + offset aléatoire pour éviter les collisions
  // entre runs rapprochés (idempotence de la recette terrain).
  const dayConflict = 1 + (Number(stamp.slice(-3)) % 5); // lun–ven
  const baseHour = 7 + (Number(stamp.slice(-4)) % 8); // 07–14h
  const minute = Number(stamp.slice(-2)) % 50; // 0–49
  const pad = (n: number) => String(n).padStart(2, '0');
  const startA = `${pad(baseHour)}:${pad(minute)}`;
  const endA = `${pad(baseHour + 1)}:${pad(minute)}`;
  const startB = `${pad(baseHour)}:${pad(Math.min(minute + 25, 55))}`;
  const endB = `${pad(baseHour + 1)}:${pad(Math.min(minute + 25, 55))}`;
  // Si un seul cours enseignant existe, en créer un second temporaire pour le conflit.
  let courseB = course2;
  if (course1.id === course2.id) {
    const created = await fetch(`${API}/courses`, {
      method: 'POST',
      headers: { ...authHeaders(tokenDir), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `Recette conflit ${stamp}`,
        institutionId: instA,
        classId: classA.id,
        teacherId,
        status: 'active',
      }),
    });
    const createdBody = await json(created);
    const newId = (createdBody.course as { id?: string } | undefined)?.id;
    if (created.status === 201 && newId) {
      courseB = { id: newId, teacherId };
    }
  }
  const slot = {
    courseId: course1.id,
    classId: classA.id,
    institutionId: instA,
    teacherId,
    dayOfWeek: dayConflict,
    startTime: startA,
    endTime: endA,
    room: `Recette-${stamp}`,
  };
  const first = await fetch(`${API}/schedules`, {
    method: 'POST',
    headers: { ...authHeaders(tokenDir), 'Content-Type': 'application/json' },
    body: JSON.stringify(slot),
  });
  const overlap = await fetch(`${API}/schedules`, {
    method: 'POST',
    headers: { ...authHeaders(tokenDir), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...slot,
      courseId: courseB.id,
      startTime: startB,
      endTime: endB,
      room: `Recette-B-${stamp}`,
    }),
  });
  const overlapBody = await json(overlap);
  const conflicts = (overlapBody.conflicts as { reasons?: string[] }[] | undefined) ?? [];
  const teacherConflict = conflicts.some((c) => c.reasons?.includes('teacher'));
  const forced = await fetch(`${API}/schedules`, {
    method: 'POST',
    headers: { ...authHeaders(tokenDir), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...slot,
      courseId: courseB.id,
      startTime: startB,
      endTime: endB,
      room: `Recette-B-${stamp}`,
      force: true,
    }),
  });
  const forcedBody = await json(forced);
  const forcedId = (forcedBody.schedule as { id?: string } | undefined)?.id;
  const logs = await fetch(
    `${API}/audit-log?institutionId=${instA}&action=schedule.conflict_forced`,
    { headers: authHeaders(tokenDir) }
  );
  const logsBody = await json(logs);
  const audited = (((logsBody.logs as { targetId?: string }[] | undefined) ?? []).some((l) => l.targetId === forcedId));
  const l31ok = first.status === 201 && overlap.status === 409 && teacherConflict && forced.status === 201 && audited;
  record(
    'L3-1',
    l31ok,
    l31ok
      ? '409 avec conflit enseignant ; force:true créé et audité'
      : `create=${first.status} conflict=${overlap.status} teacher=${teacherConflict} force=${forced.status} audit=${audited} day=${dayConflict} ${startA}-${endA}`
  );

  // L3-2 — annuler une occurrence, les autres semaines restent
  // force:true si un créneau résiduel bloque : on teste les exceptions, pas le conflit.
  const dayException = 6; // samedi
  const exHour = 18 + (Number(stamp.slice(-2)) % 3); // 18–20
  const exMin = Number(stamp.slice(-3, -1)) % 40;
  const startEx = `${pad(exHour)}:${pad(exMin)}`;
  const endEx = `${pad(exHour + 1)}:${pad(exMin)}`;
  const satPayload = {
    courseId: course1.id,
    classId: classA.id,
    institutionId: instA,
    teacherId,
    dayOfWeek: dayException,
    startTime: startEx,
    endTime: endEx,
    room: `Recette-sam-${stamp}`,
  };
  let satSlot = await fetch(`${API}/schedules`, {
    method: 'POST',
    headers: { ...authHeaders(tokenDir), 'Content-Type': 'application/json' },
    body: JSON.stringify(satPayload),
  });
  if (satSlot.status === 409) {
    satSlot = await fetch(`${API}/schedules`, {
      method: 'POST',
      headers: { ...authHeaders(tokenDir), 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...satPayload, force: true }),
    });
  }
  const satBody = await json(satSlot);
  const scheduleId = (satBody.schedule as { id?: string } | undefined)?.id;
  const saturdays: string[] = [];
  const cursor = new Date('2026-10-01T12:00:00Z');
  while (saturdays.length < 3) {
    if (cursor.getUTCDay() === 6) saturdays.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  const cancelledDate = saturdays[0];
  const keptDate = saturdays[1];
  let l32ok = false;
  if (!scheduleId || satSlot.status !== 201) {
    record('L3-2', false, `créneau récurrent impossible (${satSlot.status}) ${startEx}-${endEx}`);
  } else {
    const ex = await fetch(`${API}/schedules/${scheduleId}/exceptions`, {
      method: 'POST',
      headers: { ...authHeaders(tokenDir), 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: cancelledDate, type: 'cancelled', reason: 'Recette L3-2' }),
    });
    const effective = await fetch(
      `${API}/schedules/effective?institutionId=${instA}&classId=${classA.id}&from=2026-10-01&to=2026-10-20`,
      { headers: authHeaders(tokenDir) }
    );
    const occ = (((await json(effective)).occurrences as { date: string; scheduleId: string; status: string }[] | undefined) ?? []).filter(
      (o) => o.scheduleId === scheduleId
    );
    const cancelled = occ.find((o) => o.date === cancelledDate);
    const kept = occ.find((o) => o.date === keptDate);
    l32ok =
      ex.status === 201 &&
      effective.status === 200 &&
      cancelled?.status === 'cancelled' &&
      kept?.status === 'normal';
    record(
      'L3-2',
      l32ok,
      l32ok
        ? `${cancelledDate} annulé ; ${keptDate} inchangé`
        : `ex=${ex.status} cancelled=${cancelled?.status} kept=${kept?.status}`
    );
  }

  // L3-3 — idempotence hors ligne (même clientId, retry)
  const clientId = `offline-l3-${stamp}`;
  const absencePayload = {
    studentId: studentA.id,
    institutionId: instA,
    type: 'absence',
    date: '2026-01-15',
    duration: 60,
    clientId,
  };
  const a1 = await fetch(`${API}/absences`, {
    method: 'POST',
    headers: { ...authHeaders(tokenTeacher), 'Content-Type': 'application/json' },
    body: JSON.stringify(absencePayload),
  });
  const a1Body = await json(a1);
  const id1 = (a1Body.absence as { id?: string } | undefined)?.id;
  const a2 = await fetch(`${API}/absences`, {
    method: 'POST',
    headers: { ...authHeaders(tokenTeacher), 'Content-Type': 'application/json' },
    body: JSON.stringify(absencePayload),
  });
  const a2Body = await json(a2);
  const id2 = (a2Body.absence as { id?: string } | undefined)?.id;
  const listed = await fetch(`${API}/absences?studentId=${studentA.id}&date=2026-01-15`, {
    headers: authHeaders(tokenTeacher),
  });
  const listedAbs = ((await json(listed)).absences as { clientId?: string }[] | undefined) ?? [];
  const sameClient = listedAbs.filter((a) => a.clientId === clientId);
  const l33ok = a1.status === 201 && a2.status === 201 && !!id1 && id1 === id2 && sameClient.length === 1;
  record(
    'L3-3',
    l33ok,
    l33ok
      ? 'retry hors ligne : une seule écriture'
      : `first=${a1.status} retry=${a2.status} sameId=${id1 === id2} count=${sameClient.length}`
  );

  // L3-4 — seuil d’absences : alerte direction + famille, une seule fois
  const studentUser = await fetch(`${API}/users`, {
    method: 'POST',
    headers: { ...authHeaders(tokenDir), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: `eleve.l3.${stamp}@recette.local`,
      firstName: 'Lina',
      lastName: `Seuil${stamp.slice(-4)}`,
      role: 'student',
      institutionId: instA,
    }),
  });
  const parentUser = await fetch(`${API}/users`, {
    method: 'POST',
    headers: { ...authHeaders(tokenDir), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: `parent.l3.${stamp}@recette.local`,
      firstName: 'Omar',
      lastName: `Seuil${stamp.slice(-4)}`,
      role: 'parent',
      institutionId: instA,
    }),
  });
  const studentId = ((await json(studentUser)).user as { id?: string } | undefined)?.id;
  const parentId = ((await json(parentUser)).user as { id?: string } | undefined)?.id;
  if (studentUser.status !== 201 || parentUser.status !== 201 || !studentId || !parentId) {
    record('L3-4', false, `création élève/parent ${studentUser.status}/${parentUser.status}`);
  } else {
    const link = await fetch(`${API}/guardians`, {
      method: 'POST',
      headers: { ...authHeaders(tokenDir), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        institutionId: instA,
        studentId,
        guardianId: parentId,
        relationship: 'father',
        canReceiveCommunications: true,
      }),
    });
    await fetch(`${API}/institutions/${instA}`, {
      method: 'PATCH',
      headers: { ...authHeaders(tokenDir), 'Content-Type': 'application/json' },
      body: JSON.stringify({ absenceThreshold: 2, latenessThreshold: null, thresholdWindowDays: 30 }),
    });
    const day = (offset: number) => {
      const d = new Date();
      d.setDate(d.getDate() - offset);
      return d.toISOString().slice(0, 10);
    };
    await fetch(`${API}/absences`, {
      method: 'POST',
      headers: { ...authHeaders(tokenTeacher), 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, institutionId: instA, type: 'absence', date: day(1), duration: 60 }),
    });
    await fetch(`${API}/absences`, {
      method: 'POST',
      headers: { ...authHeaders(tokenTeacher), 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, institutionId: instA, type: 'absence', date: day(2), duration: 60 }),
    });

    const countNotifs = async (userId: string) => {
      const res = await fetch(`${API}/notifications?userId=${userId}`, { headers: authHeaders(tokenDir) });
      const body = await json(res);
      return ((body.notifications as unknown[] | undefined) ?? []).length;
    };
    const dirBefore = await countNotifs(directionId);
    const famBefore = await countNotifs(parentId);
    const check1 = await fetch(`${API}/absences/threshold-check`, {
      method: 'POST',
      headers: authHeaders(tokenAdmin),
    });
    const check1Body = await json(check1);
    const dirAfter = await countNotifs(directionId);
    const famAfter = await countNotifs(parentId);
    const alerts1 = await fetch(
      `${API}/absences/threshold-alerts?institutionId=${instA}&studentId=${studentId}`,
      { headers: authHeaders(tokenDir) }
    );
    const n1 = (((await json(alerts1)).alerts as unknown[] | undefined) ?? []).length;
    await fetch(`${API}/absences/threshold-check`, { method: 'POST', headers: authHeaders(tokenAdmin) });
    const alerts2 = await fetch(
      `${API}/absences/threshold-alerts?institutionId=${instA}&studentId=${studentId}`,
      { headers: authHeaders(tokenDir) }
    );
    const n2 = (((await json(alerts2)).alerts as unknown[] | undefined) ?? []).length;
    const l34ok =
      link.status === 201 &&
      check1.status === 200 &&
      Number(check1Body.alertsSent) >= 1 &&
      dirAfter > dirBefore &&
      famAfter > famBefore &&
      n1 >= 1 &&
      n2 === n1;
    record(
      'L3-4',
      l34ok,
      l34ok
        ? 'alerte direction + famille ; second passage sans doublon'
        : `link=${link.status} check=${check1.status} sent=${check1Body.alertsSent} dir=${dirBefore}->${dirAfter} fam=${famBefore}->${famAfter} alerts=${n1}->${n2}`
    );
  }

  const failed = steps.filter((s) => !s.ok);
  console.log(`\nLot 3 : ${steps.filter((s) => s.ok).length}/${steps.length} pass`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
