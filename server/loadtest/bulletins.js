import http from 'k6/http';
import { check } from 'k6';
import exec from 'k6/execution';

/**
 * NFR-010 (Lot 11) — scénario « publication massive de bulletins » : à la
 * fin d'une période, la direction publie les notes de toutes les classes,
 * lance le calcul des moyennes/rangs (EVA-004), puis génère le bulletin
 * (PDF, DOC-001/EVA-006) de chaque élève. Contrairement au scénario
 * « rentrée » (beaucoup d'utilisateurs, peu de travail chacun), celui-ci
 * est peu d'utilisateurs (quelques membres de la direction) mais beaucoup
 * d'écritures coûteuses (génération de PDF) en peu de temps — le profil de
 * charge inverse.
 *
 * Une VU = une classe entière (publication + calcul + un bulletin PDF par
 * élève), toutes les classes traitées en parallèle. 8 classes réelles, 28
 * élèves chacune (voir seed.ts) : 224 bulletins PDF générés au total.
 *
 * Usage : voir rentree.js (même seed, même invocation docker).
 */

const BASE_URL = __ENV.BASE_URL || 'http://host.docker.internal:4000';
const sessionData = JSON.parse(open(__ENV.SESSION_FILE || './output/session.json'));
const headers = { Authorization: `Bearer ${sessionData.adminToken}`, 'Content-Type': 'application/json' };

export const options = {
  scenarios: {
    bulk_publish: {
      executor: 'shared-iterations',
      exec: 'publishClass',
      // Une VU par classe, une seule itération chacune : voir la note sur
      // exec.vu.idInTest ci-dessous pour la raison de ce choix précis.
      vus: sessionData.classes.length,
      iterations: sessionData.classes.length,
      maxDuration: '3m',
    },
  },
  thresholds: {
    // docs/SLO.md : p95 écriture < 800ms. La génération de bulletin (PDF)
    // est l'écriture la plus coûteuse du produit — c'est délibérément elle
    // qui est mesurée ici, pas une écriture générique.
    'http_req_duration{name:report_card}': ['p(95)<800'],
    http_req_failed: ['rate<0.01'],
  },
};

export function publishClass() {
  // Bug de script trouvé en écrivant ce test (16/08/2026) : `__ITER` est
  // LOCAL à chaque VU (son nombre d'itérations déjà exécutées), pas un
  // compteur global partagé — avec plusieurs VU, `classes[__ITER % ...]`
  // valait `classes[0]` pour TOUTES les VU à leur premier passage, qui se
  // sont donc mises à générer les mêmes 28 bulletins en même temps. C'est
  // exactement ce qui a révélé la vraie course de concurrence côté serveur,
  // corrigée dans `generateDocument` (documents.routes.ts). `exec.vu.idInTest`
  // (identifiant de VU, unique et stable sur toute la durée du test) donne
  // à chaque VU sa propre classe, comme prévu par le scénario.
  const vuIndex = exec.vu.idInTest - 1; // idInTest démarre à 1.
  const klass = sessionData.classes[vuIndex % sessionData.classes.length];

  // 1) Publication des notes de chaque cours de la classe (EVA-005).
  for (const courseId of klass.courseIds) {
    const res = http.post(
      `${BASE_URL}/grades/publish`,
      JSON.stringify({ courseId, periodId: sessionData.periodId }),
      { headers, tags: { name: 'grades_publish' } }
    );
    check(res, { 'POST /grades/publish -> 200': (r) => r.status === 200 });
  }

  // 2) Calcul des moyennes/rangs de la classe pour cette période (EVA-004).
  const computeRes = http.post(
    `${BASE_URL}/grades/compute`,
    JSON.stringify({ classId: klass.id, periodId: sessionData.periodId }),
    { headers, tags: { name: 'grades_compute' } }
  );
  check(computeRes, { 'POST /grades/compute -> 201': (r) => r.status === 201 });

  // 3) Un bulletin PDF par élève de la classe (DOC-001/EVA-006) — la partie
  // la plus coûteuse en CPU (génération PDF, pdf-lib) de tout le scénario.
  for (const studentId of klass.studentIds) {
    const res = http.post(
      `${BASE_URL}/documents/report-card`,
      JSON.stringify({ studentId, periodId: sessionData.periodId }),
      { headers, tags: { name: 'report_card' } }
    );
    check(res, { 'POST /documents/report-card -> 201': (r) => r.status === 201 });
  }
}
