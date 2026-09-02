'use client';
import { useCallback, useEffect, useState } from 'react';
import { getSyncStats, syncPendingReceipts, type PushFn, registerOnlineSync } from '@/lib/sync-engine';

export type SyncStats = { pending: number; synced: number; queue: number };

export function useOfflineSync(push?: PushFn) {
  const [stats, setStats] = useState<SyncStats>({ pending: 0, synced: 0, queue: 0 });
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [isSyncing, setIsSyncing] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const s = await getSyncStats();
      setStats(s);
    } catch {}
  }, []);

  const syncNow = useCallback(async () => {
    if (!push) return;
    setIsSyncing(true);
    try {
      await syncPendingReceipts(push);
      await refresh();
    } finally {
      setIsSyncing(false);
    }
  }, [push, refresh]);

  useEffect(() => {
    refresh();
    const onOnline = () => {
      setIsOnline(true);
      if (push) void syncNow();
      void refresh();
    };
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    const id = window.setInterval(refresh, 3000);
    // si hay push, auto registrar onlineSync nativo (backup)
    let offOnlineSync: () => void | undefined;
    if (push) offOnlineSync = registerOnlineSync(push);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      clearInterval(id);
      offOnlineSync?.();
    };
  }, [push, refresh, syncNow]);

  return { ...stats, isOnline, isSyncing, refresh, syncNow };
}
