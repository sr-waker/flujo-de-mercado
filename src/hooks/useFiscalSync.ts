"use client";
import { useEffect, useState, useCallback } from 'react';
import { getAfipQueueStats, getPendingAfipQueue } from '@/lib/taller-db';

export function useFiscalSync() {
  const [stats, setStats] = useState({ pending: 0, sent: 0, error: 0 });
  const refresh = useCallback(async () => {
    try {
      const s = await getAfipQueueStats();
      setStats(s);
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 4000);
    const onVis = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', refresh);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('focus', refresh); };
  }, [refresh]);
  return { stats, refresh, hasPendingCae: stats.pending > 0 };
}

export async function syncPendingAfip(
  pushFn: (payload: unknown) => Promise<{ cae: string; caeVto: string | null }>
): Promise<number> {
  const { getPendingAfipQueue, markAfipSuccess, markAfipError } = await import('@/lib/taller-db');
  const pending = await getPendingAfipQueue();
  let synced = 0;
  for (const item of pending) {
    try {
      const res = await pushFn(item.payload);
      await markAfipSuccess(item.id, res.cae, res.caeVto);
      synced++;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      await markAfipError(item.id, msg);
    }
  }
  return synced;
}
