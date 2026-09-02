import { useEffect, useState, useCallback } from 'react';
import { getTransferQueueStats, getPendingTransfers, markTransferApproved, markTransferRejected, type TransferQueueItem } from '@/lib/taller-db';

export function useTransferSync(pollMs = 5000) {
  const [stats, setStats] = useState<{ pending: number; approved: number; rejected: number; pendingTotal: number; approvedTotal: number }>({
    pending: 0, approved: 0, rejected: 0, pendingTotal: 0, approvedTotal: 0,
  });
  const [pending, setPending] = useState<TransferQueueItem[]>([]);
  const refresh = useCallback(async () => {
    try {
      const [s, p] = await Promise.all([getTransferQueueStats(), getPendingTransfers()]);
      setStats(s);
      setPending(p);
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, pollMs);
    const onVis = () => { if (document.visibilityState === 'visible') refresh(); };
    const onOnline = () => refresh();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('online', onOnline);
    window.addEventListener('focus', onOnline);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('online', onOnline); window.removeEventListener('focus', onOnline); };
  }, [refresh, pollMs]);
  const approve = useCallback(async (id: string) => { await markTransferApproved(id); await refresh(); }, [refresh]);
  const reject = useCallback(async (id: string, note?: string) => { await markTransferRejected(id, note); await refresh(); }, [refresh]);
  return { stats, pending, refresh, approve, reject };
}
