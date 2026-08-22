import request from 'supertest';
import type { Express } from 'express';

/** Remplit toutes les pièces obligatoires uploadables (mode local) pour permettre submit. */
export async function fillRequiredAdmissionPacket(app: Express, token: string) {
  let packet = await request(app).get(`/admissions/status/${token}/packet`);
  if (packet.status !== 200) return packet;

  for (const item of packet.body.items as Array<{
    id: string;
    obligation: string;
    status: string;
    originalMode?: string;
  }>) {
    if (item.obligation !== 'required' && item.obligation !== 'conditional') continue;
    if (item.originalMode === 'physical_only') continue;
    if (['uploaded', 'in_review', 'compliant', 'original_pending', 'finalized'].includes(item.status)) continue;

    const presign = await request(app)
      .post(`/admissions/status/${token}/packet/items/${item.id}/presign-upload`)
      .send({ filename: `${item.id}.pdf`, contentType: 'application/pdf' });
    if (presign.status !== 200) continue;

    if (presign.body.mode === 'local') {
      await request(app)
        .put(`/admissions/status/${token}/documents/direct-upload`)
        .set('Content-Type', 'application/pdf')
        .set('X-Object-Key', presign.body.key)
        .send(Buffer.from(`%PDF-1.4 ${item.id}`));
      await request(app)
        .post(`/admissions/status/${token}/packet/items/${item.id}/attach`)
        .send({
          fileKey: presign.body.key,
          fileName: `${item.id}.pdf`,
          contentType: 'application/pdf',
          sizeBytes: 20,
        });
    }
  }

  return request(app).get(`/admissions/status/${token}/packet`);
}
