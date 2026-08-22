import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';

/**
 * NFR-010 (Lot 11) — scénario « rentrée » : beaucoup d'utilisateurs
 * (élèves très majoritairement, quelques enseignants/direction) consultent
 * l'application au même moment — connexion déjà faite, lecture de
 * l'emploi du temps, de la liste de classe/effectifs. Volumétrie : 8
 * classes réelles, 224 élèves (voir seed.ts), montée à 150 utilisateurs
 * simultanés.
 *
 * Usage :
 *   npx tsx loadtest/seed.ts loadtest/output/session.json
 *   docker run --rm -i --add-host=host.docker.internal:host-gateway \
 *     -v "$(pwd)/loadtest:/loadtest" grafana/k6 run \
 *     -e SESSION_FILE=/loadtest/output/session.json /loadtest/rentree.js
 */

const BASE_URL = __ENV.BASE_URL || 'http://host.docker.internal:4000';
const sessionData = JSON.parse(open(__ENV.SESSION_FILE || './output/session.json'));

// SharedArray : le fichier n'est parsé qu'une fois, partagé en lecture
// entre toutes les VU (pas une copie par VU — 224 jetons ne sont rien, mais
// c'est la pratique k6 correcte y compris pour de plus gros volumes).
const studentTokens = new SharedArray('studentTokens', () => sessionData.studentTokens);
const classIds = new SharedArray('classIds', () => sessionData.classes.map((c) => c.id));

export const options = {
  scenarios: {
    // La grande majorité du trafic de rentrée : des élèves qui consultent
    // l'app (jamais d'écriture ici — PRS-003/UX-005 gèrent déjà la lecture
    // hors-ligne, ce scénario mesure le cas "en ligne, beaucoup de monde").
    student_reads: {
      executor: 'ramping-vus',
      exec: 'studentRead',
      startVUs: 0,
      stages: [
        { duration: '20s', target: 100 },
        { duration: '40s', target: 150 },
        { duration: '20s', target: 0 },
      ],
    },
    // Une poignée de personnel (direction/enseignants) consultant des vues
    // plus larges (tout l'effectif de l'établissement) en parallèle —
    // trafic bien plus rare mais individuellement plus coûteux par requête.
    staff_reads: {
      executor: 'constant-vus',
      exec: 'staffRead',
      vus: 3,
      duration: '80s',
      startTime: '10s',
    },
  },
  thresholds: {
    // docs/SLO.md : p95 lecture < 500ms.
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

const dateRange = () => ({ from: '2026-09-01', to: '2026-09-07' });

export function studentRead() {
  const token = studentTokens[__VU % studentTokens.length];
  const headers = { Authorization: `Bearer ${token}` };

  const me = http.get(`${BASE_URL}/auth/me`, { headers, tags: { name: 'auth_me' } });
  check(me, { 'GET /auth/me -> 200': (r) => r.status === 200 });

  const classId = classIds[__VU % classIds.length];
  const { from, to } = dateRange();
  const schedule = http.get(
    `${BASE_URL}/schedules/effective?institutionId=${sessionData.institutionId}&classId=${classId}&from=${from}&to=${to}`,
    { headers, tags: { name: 'schedules_effective' } }
  );
  check(schedule, { 'GET /schedules/effective -> 200': (r) => r.status === 200 });

  sleep(1);
}

export function staffRead() {
  const token = [sessionData.adminToken, sessionData.teacherToken][__VU % 2];
  const headers = { Authorization: `Bearer ${token}` };

  const students = http.get(`${BASE_URL}/students?institutionId=${sessionData.institutionId}`, {
    headers,
    tags: { name: 'students_list' },
  });
  check(students, { 'GET /students -> 200': (r) => r.status === 200 });

  const absences = http.get(`${BASE_URL}/absences?institutionId=${sessionData.institutionId}`, {
    headers,
    tags: { name: 'absences_list' },
  });
  check(absences, { 'GET /absences -> 200': (r) => r.status === 200 });

  sleep(2);
}
