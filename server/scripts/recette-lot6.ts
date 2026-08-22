/**
 * Recette locale — Lot 6 (communication : opt-out, e-mail gated, accusé).
 *
 * Prérequis : API sur :4000, comptes seed (comptes RECETTE_* (env) + données métier).
 *   cd server && npx tsx scripts/recette-lot6.ts
 *
 * SMS/e-mail réels : 501 tant que Twilio/SMTP absents ou `CADDYNOTE_TEST_MODE`.
 * L’opt-out et l’accusé (COM-003/005) se jouent sur le canal `push`.
 * La file pg-boss + retry SMTP down est couverte par `queue.test.ts` (CI) ;
 * si l’API répond 202 (SMTP « configuré »), on attend le journal `failed`.
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

type CommLog = {
  id: string;
  status: string;
  skippedOptOut?: boolean;
  isCritical?: boolean;
  acknowledgedAt?: string | null;
  channel?: string;
};

async function main() {
  const health = await fetch(`${API}/health`);
  if (!health.ok) throw new Error(`API injoignable sur ${API} (${health.status})`);
  const healthBody = (await health.json()) as { databaseTarget?: { profile?: string } };
  console.log(`Cible API ${API} — profil DB : ${healthBody.databaseTarget?.profile ?? '?'}\n`);

  const teacher = await login(getRecetteEmail('teacher'));
  const student = await login(getRecetteEmail('student'));
  const student2 = await login(getRecetteEmail('student'));
  const dir = await login(getRecetteEmail('school_admin'));
  if (teacher.status !== 200 || student.status !== 200 || student2.status !== 200 || dir.status !== 200) {
    record(
      'L6-prep',
      false,
      `login enseignant=${teacher.status} élève=${student.status} élève2=${student2.status} direction=${dir.status}`
    );
    process.exitCode = 1;
    return;
  }

  const tokenTeacher = teacher.body.token as string;
  const tokenStudent = student.body.token as string;
  const tokenStudent2 = student2.body.token as string;
  const tokenDir = dir.body.token as string;
  const studentId = (student.body.user as { id?: string }).id;
  if (!studentId) {
    record('L6-prep', false, 'id élève manquant');
    process.exitCode = 1;
    return;
  }

  const send = async (token: string, body: unknown) => {
    const res = await fetch(`${API}/communications/send`, {
      method: 'POST',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await json(res) };
  };

  const setPref = async (token: string, channel: string, optedIn: boolean) => {
    const res = await fetch(`${API}/communications/preferences/${channel}`, {
      method: 'PUT',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ optedIn }),
    });
    return res.status;
  };

  const notifCount = async () => {
    const res = await fetch(`${API}/notifications?userId=${studentId}`, { headers: authHeaders(tokenDir) });
    return (((await json(res)).notifications as unknown[] | undefined) ?? []).length;
  };

  const getLog = async (id: string) => {
    const res = await fetch(`${API}/communications/logs/${id}`, { headers: authHeaders(tokenTeacher) });
    return { status: res.status, log: (await json(res)).log as CommLog | undefined };
  };

  const waitFailed = async (id: string, timeoutMs = 15000): Promise<CommLog | undefined> => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const { log } = await getLog(id);
      if (log?.status === 'failed' || log?.status === 'sent' || log?.status === 'delivered') return log;
      await new Promise((r) => setTimeout(r, 400));
    }
    const { log } = await getLog(id);
    return log;
  };

  // L6-1 — opt-out SMS (gated) + opt-out push (journal failed, pas d'envoi)
  const smsOptOut = await setPref(tokenStudent, 'sms', false);
  const smsSend = await send(tokenTeacher, {
    recipientId: studentId,
    channel: 'sms',
    body: `Recette L6-1 SMS ${stamp}`,
  });

  const beforePush = await notifCount();
  const pushOptOut = await setPref(tokenStudent, 'push', false);
  const blockedBody = `Recette L6-1 bloqué ${stamp}`;
  const pushSend = await send(tokenTeacher, {
    recipientId: studentId,
    channel: 'push',
    subject: 'Opt-out',
    body: blockedBody,
  });
  const pushLog = (pushSend.body.log as CommLog | undefined) ?? { id: '', status: '' };
  const afterPush = await notifCount();
  await setPref(tokenStudent, 'push', true);
  await setPref(tokenStudent, 'sms', true);

  const l61ok =
    smsOptOut === 200 &&
    smsSend.status === 501 &&
    pushOptOut === 200 &&
    pushSend.status === 201 &&
    pushLog.status === 'failed' &&
    pushLog.skippedOptOut === true &&
    afterPush === beforePush;
  record(
    'L6-1',
    l61ok,
    l61ok
      ? 'SMS 501 (jamais d’envoi réel) ; push opt-out → journal failed/skippedOptOut'
      : `smsPref=${smsOptOut} smsSend=${smsSend.status} pushPref=${pushOptOut} pushSend=${pushSend.status} status=${pushLog.status} skip=${pushLog.skippedOptOut} notifs=${beforePush}->${afterPush}`
  );

  // L6-2 — e-mail : 501 si SMTP gated, sinon 202 queued puis journal failed (pas sent)
  const emailSend = await send(tokenTeacher, {
    recipientId: studentId,
    channel: 'email',
    subject: `Recette L6-2 ${stamp}`,
    body: `SMTP recette ${stamp}`,
  });
  const emailLog = emailSend.body.log as CommLog | undefined;
  let l62ok = false;
  let l62detail = '';
  if (emailSend.status === 501) {
    l62ok = !emailLog || (emailLog.status !== 'sent' && emailLog.status !== 'delivered');
    l62detail = l62ok
      ? 'SMTP non configuré / test mode → 501, aucun journal sent (retry file : queue.test.ts)'
      : `501 mais log.status=${emailLog?.status}`;
  } else if (emailSend.status === 202 && emailLog?.status === 'queued' && emailLog.id) {
    const finalLog = await waitFailed(emailLog.id);
    l62ok = finalLog?.status === 'failed';
    l62detail = l62ok
      ? `202 queued puis journal failed (pas sent)`
      : `202 queued puis status=${finalLog?.status ?? 'timeout'}`;
  } else {
    l62detail = `email=${emailSend.status} log=${emailLog?.status ?? 'aucun'}`;
  }
  record('L6-2', l62ok, l62detail);

  // L6-3 — message critique : seul le destinataire accuse
  const critical = await send(tokenTeacher, {
    recipientId: studentId,
    channel: 'push',
    subject: 'Convocation',
    body: `Recette L6-3 critique ${stamp}`,
    isCritical: true,
  });
  const criticalLog = (critical.body.log as CommLog | undefined) ?? { id: '', status: '' };
  const ackOther = await fetch(`${API}/communications/logs/${criticalLog.id}/acknowledge`, {
    method: 'POST',
    headers: authHeaders(tokenStudent2),
  });
  const ackTeacher = await fetch(`${API}/communications/logs/${criticalLog.id}/acknowledge`, {
    method: 'POST',
    headers: authHeaders(tokenTeacher),
  });
  const ackSelf = await fetch(`${API}/communications/logs/${criticalLog.id}/acknowledge`, {
    method: 'POST',
    headers: authHeaders(tokenStudent),
  });
  const ackSelfBody = await json(ackSelf);
  const acked = ackSelfBody.log as CommLog | undefined;

  const l63ok =
    critical.status === 201 &&
    criticalLog.status === 'delivered' &&
    ackOther.status === 403 &&
    ackTeacher.status === 403 &&
    ackSelf.status === 200 &&
    !!acked?.acknowledgedAt;
  record(
    'L6-3',
    l63ok,
    l63ok
      ? 'accusé posé par le destinataire ; un tiers (élève2, enseignant) refusé'
      : `send=${critical.status}/${criticalLog.status} other=${ackOther.status} teacher=${ackTeacher.status} self=${ackSelf.status} ack=${acked?.acknowledgedAt}`
  );

  const failed = steps.filter((s) => !s.ok);
  console.log(`\nLot 6 : ${steps.filter((s) => s.ok).length}/${steps.length} pass`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
