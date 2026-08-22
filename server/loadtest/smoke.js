// Smoke test rapide (pas le scénario final) — vérifie que chaque requête
// utilisée par rentree.js/bulletins.js répond bien avant de lancer la
// charge complète.
import http from 'k6/http';
import { check } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://host.docker.internal:4000';
const sessionData = JSON.parse(open(__ENV.SESSION_FILE || './output/session.json'));

export default function () {
  const staffHeaders = { Authorization: `Bearer ${sessionData.adminToken}` };
  const studentHeaders = { Authorization: `Bearer ${sessionData.studentTokens[0]}` };
  const classId = sessionData.classes[0].id;

  check(http.get(`${BASE_URL}/auth/me`, { headers: studentHeaders }), { 'me 200': (r) => r.status === 200 });
  check(
    http.get(`${BASE_URL}/schedules/effective?institutionId=${sessionData.institutionId}&classId=${classId}&from=2026-09-01&to=2026-09-07`, {
      headers: studentHeaders,
    }),
    { 'schedule 200': (r) => r.status === 200 }
  );
  check(http.get(`${BASE_URL}/students?institutionId=${sessionData.institutionId}`, { headers: staffHeaders }), {
    'students 200': (r) => r.status === 200,
  });
  check(http.get(`${BASE_URL}/absences?institutionId=${sessionData.institutionId}`, { headers: staffHeaders }), {
    'absences 200': (r) => r.status === 200,
  });
  check(http.get(`${BASE_URL}/openapi.json`), { 'openapi 200': (r) => r.status === 200 });
}
