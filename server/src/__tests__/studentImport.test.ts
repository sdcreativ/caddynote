import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { prisma } from '../lib/prisma.js';
import { buildFixture, auth, type Fixture } from './fixtures.js';
import { parseCsv, parseCsvWithHeader } from '../lib/csvImport.js';

describe('Analyseur CSV (ELV-005)', () => {
  it('découpe des champs simples', () => {
    expect(parseCsv('a,b,c\n1,2,3\n')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('gère les champs entre guillemets avec virgule et guillemet échappé', () => {
    expect(parseCsv('nom,note\n"Dupont, Jean","Dit ""le grand"""\n')).toEqual([
      ['nom', 'note'],
      ['Dupont, Jean', 'Dit "le grand"'],
    ]);
  });

  it('retire le BOM UTF-8 (produit par toCsv côté export)', () => {
    expect(parseCsv('﻿a,b\n1,2\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('parseCsvWithHeader produit des objets clé/valeur', () => {
    expect(parseCsvWithHeader('firstName,lastName\nJean,Dupont\n')).toEqual([{ firstName: 'Jean', lastName: 'Dupont' }]);
  });
});

describe('Import en masse d’élèves (ELV-005)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await buildFixture();
  }, 30000);

  const rnd = () => Math.random().toString(36).slice(2, 10);

  it('crée les élèves valides, rattache la classe par nom, journalise la traçabilité', async () => {
    const e1 = `import.${rnd()}@test.caddynote`;
    const e2 = `import.${rnd()}@test.caddynote`;
    const classRes = await prisma.strkClass.findUnique({ where: { id: fx.a.classId }, select: { name: true } });

    const csv = `firstName,lastName,email,className\nAlice,Martin,${e1},${classRes!.name}\nBob,Durand,${e2},\n`;

    const res = await request(app)
      .post('/students/import')
      .set(auth(fx.a.schoolAdmin.token))
      .send({ csv, institutionId: fx.a.institutionId });
    expect(res.status).toBe(200);
    expect(res.body.created).toBe(2);
    expect(res.body.errors).toBe(0);

    const alice = await prisma.strkProfile.findUnique({ where: { email: e1 } });
    expect(alice?.role).toBe('student');
    const aliceExt = await prisma.strkStudent.findUnique({ where: { id: alice!.id } });
    expect(aliceExt?.classId).toBe(fx.a.classId);

    const auditEntry = await prisma.strkAuditLog.findFirst({
      where: { action: 'student.bulk_imported', institutionId: fx.a.institutionId },
      orderBy: { createdAt: 'desc' },
    });
    expect(auditEntry).not.toBeNull();
    expect((auditEntry!.metadata as any).created).toBe(2);
  });

  it('signale une ligne invalide sans bloquer les lignes valides du même lot', async () => {
    const validEmail = `import.${rnd()}@test.caddynote`;
    const csv = `firstName,lastName,email\n,ManqueLePrenom,${`import.${rnd()}@test.caddynote`}\nClaire,Petit,${validEmail}\n`;

    const res = await request(app)
      .post('/students/import')
      .set(auth(fx.a.schoolAdmin.token))
      .send({ csv, institutionId: fx.a.institutionId });
    expect(res.status).toBe(200);
    expect(res.body.created).toBe(1);
    expect(res.body.errors).toBe(1);
    expect(res.body.results.find((r: any) => r.status === 'error').row).toBe(2);
  });

  it('un e-mail déjà existant est signalé comme doublon, pas comme erreur', async () => {
    const csv = `firstName,lastName,email\nDoublon,Test,${fx.a.student.email}\n`;
    const res = await request(app)
      .post('/students/import')
      .set(auth(fx.a.schoolAdmin.token))
      .send({ csv, institutionId: fx.a.institutionId });
    expect(res.status).toBe(200);
    expect(res.body.skipped).toBe(1);
    expect(res.body.created).toBe(0);
  });

  it("le personnel d'un autre établissement ne peut pas importer (ORG-004)", async () => {
    const res = await request(app)
      .post('/students/import')
      .set(auth(fx.b.schoolAdmin.token))
      .send({ csv: 'firstName,lastName,email\nX,Y,z@test.caddynote\n', institutionId: fx.a.institutionId });
    expect(res.status).toBe(403);
  });

  it('un enseignant ne peut pas importer (rôle insuffisant)', async () => {
    const res = await request(app)
      .post('/students/import')
      .set(auth(fx.a.teacher.token))
      .send({ csv: 'firstName,lastName,email\nX,Y,z@test.caddynote\n', institutionId: fx.a.institutionId });
    expect(res.status).toBe(403);
  });
});
