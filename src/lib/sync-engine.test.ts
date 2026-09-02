import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getTallerDb, enqueueReceipt } from './taller-db';
import { syncPendingReceipts, getSyncStats } from './sync-engine';

describe('sync-engine offline->online', () => {
  beforeEach(async () => {
    const db = getTallerDb();
    await db.products.clear();
    await db.receipts.clear();
    await db.syncQueue.clear();
  });

  it('syncPendingReceipts con push ok marca synced y limpia cola', async () => {
    await enqueueReceipt({ id: 'r1', lines: [{ productId: 'p1', quantity: 1, unitPrice: 10000 }], payments: [] } as any);
    const push = vi.fn().mockResolvedValue({ ok: true, receiptNumber: '0001-00000001' });
    const res = await syncPendingReceipts(push);
    expect(res.synced).toBe(1);
    expect(res.failed).toBe(0);
    const stats = await getSyncStats();
    expect(stats.pending).toBe(0);
    expect(stats.synced).toBe(1);
    expect(push).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }));
  });

  it('push que falla deja pending y aumenta retries', async () => {
    await enqueueReceipt({ id: 'r2', lines: [{ productId: 'p1', quantity: 1, unitPrice: 5000 }], payments: [] } as any);
    const push = vi.fn().mockRejectedValue(new Error('offline'));
    const res = await syncPendingReceipts(push);
    expect(res.failed).toBe(1);
    const stats = await getSyncStats();
    expect(stats.pending).toBe(1);
    const db = getTallerDb();
    const q = await db.syncQueue.get('sync_r2');
    expect(q?.retries).toBe(1);
    expect(q?.lastError).toMatch(/offline/);
  });

  it('getSyncStats cuenta pending/synced correctamente', async () => {
    await enqueueReceipt({ id: 'a1', lines: [{ productId: 'p1', quantity: 1, unitPrice: 1000 }], payments: [] } as any);
    await enqueueReceipt({ id: 'a2', lines: [{ productId: 'p1', quantity: 2, unitPrice: 1000 }], payments: [] } as any);
    const db = getTallerDb();
    await db.receipts.update('a2', { status: 'synced' });
    const s = await getSyncStats();
    expect(s.pending).toBe(1);
    expect(s.synced).toBe(1);
    expect(s.queue).toBe(2);
  });
});
