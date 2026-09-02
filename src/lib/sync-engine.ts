import { getTallerDb } from './taller-db';

export type PushFn = (receipt: import('./taller-db').LocalReceipt) => Promise<{ ok: boolean; receiptNumber?: string }>;

export async function syncPendingReceipts(push: PushFn): Promise<{ synced: number; failed: number }> {
  const db = getTallerDb();
  const pendings = await db.receipts.where('status').equals('pending').toArray();
  let synced = 0;
  let failed = 0;
  for (const r of pendings) {
    try {
      const res = await push(r);
      if (!res.ok) throw new Error('push not ok');
      await db.receipts.update(r.id, { status: 'synced', receiptNumber: res.receiptNumber ?? r.receiptNumber ?? null, syncedAt: new Date().toISOString() });
      await db.syncQueue.delete(`sync_${r.id}`);
      synced++;
    } catch (e: any) {
      const qid = `sync_${r.id}`;
      const q = await db.syncQueue.get(qid);
      await db.syncQueue.put({
        id: qid,
        entity: 'receipts',
        payload: r,
        retries: (q?.retries ?? 0) + 1,
        lastError: e?.message ?? String(e),
        createdAt: q?.createdAt ?? r.createdAt,
      });
      failed++;
    }
  }
  return { synced, failed };
}

export async function getSyncStats(): Promise<{ pending: number; synced: number; queue: number }> {
  const db = getTallerDb();
  const [pending, synced, queue] = await Promise.all([
    db.receipts.where('status').equals('pending').count(),
    db.receipts.where('status').equals('synced').count(),
    db.syncQueue.count(),
  ]);
  return { pending, synced, queue };
}

// Hook online para UI: registrar window.addEventListener('online', () => syncPendingReceipts(...))
export function registerOnlineSync(push: PushFn): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => { void syncPendingReceipts(push); };
  window.addEventListener('online', handler);
  return () => window.removeEventListener('online', handler);
}
