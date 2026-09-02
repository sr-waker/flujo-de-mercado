import { describe, it, expect, beforeEach } from 'vitest';
import { getTallerDb, putProductLocal, enqueueReceipt, getPendingReceipts } from './taller-db';

// TDD RED para Aspecto 1-offline: DB local unifica Loyverse+Imonggo + fiscal CABA
describe('taller-db offline-first', () => {
  beforeEach(async () => {
    const db = getTallerDb();
    await db.products.clear();
    await db.customers.clear();
    await db.receipts.clear();
    await db.syncQueue.clear();
  });

  it('putProductLocal guarda y respeta barcode único case-insensitive', async () => {
    await putProductLocal({ id: 'p1', name: 'Aceite 4L', category: 'Aceites', barcode: '  ABC123 ', price: 10000, quantity: 5, userId: 'u1' } as any);
    await expect(putProductLocal({ id: 'p2', name: 'Otro', category: 'Aceites', barcode: 'abc123', price: 9000, quantity: 1, userId: 'u1' } as any)).rejects.toThrow(/barcode/i);
  });

  it('barcode distinto por userId permite mismo código entre usuarios (aislamiento por owner)', async () => {
    await putProductLocal({ id: 'p1', name: 'A', category: 'Repuestos', barcode: 'DUP', price: 1000, quantity: 1, userId: 'u1' } as any);
    await expect(putProductLocal({ id: 'p2', name: 'B', category: 'Repuestos', barcode: 'dup', price: 1000, quantity: 1, userId: 'u2' } as any)).resolves.toBeDefined();
  });

  it('enqueueReceipt crea pendiente con client_uuid y total con IVA 21', async () => {
    const r = await enqueueReceipt({ customerId: 'c1', lines: [{ productId: 'p1', quantity: 2, unitPrice: 10000 }], payments: [{ type: 'EFECTIVO', amount: 24200 }] } as any);
    expect(r.status).toBe('pending');
    expect(r.subtotal).toBe(20000);
    expect(r.iva).toBe(4200);
    expect(r.total).toBe(24200);
    const pend = await getPendingReceipts();
    expect(pend.length).toBe(1);
  });

  it('getPendingReceipts solo trae pending, no synced', async () => {
    await enqueueReceipt({ customerId: 'c1', lines: [{ productId: 'p1', quantity: 1, unitPrice: 1000 }], payments: [] } as any);
    const db = getTallerDb();
    const one = (await db.receipts.toArray())[0];
    await db.receipts.update(one.id, { status: 'synced' });
    expect((await getPendingReceipts()).length).toBe(0);
  });
});
