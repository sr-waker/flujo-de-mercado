'use client';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { useFirestore, useAuth } from '@/firebase';
import { createFirestorePush } from '@/lib/sync-firestore';
import { Wifi, WifiOff, RefreshCw, Cloud } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function OfflineBadge({ compact = false }: { compact?: boolean }) {
  const db = useFirestore();
  const auth = useAuth();
  const push = db && auth.currentUser ? createFirestorePush(db as any, auth.currentUser.uid) : undefined;
  const { pending, synced, isOnline, isSyncing, syncNow } = useOfflineSync(push);

  if (compact) {
    return (
      <span className={cn('inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest', isOnline ? 'text-emerald-600' : 'text-amber-600')}>
        {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
        {isOnline ? (pending > 0 ? `${pending} pendientes` : 'En línea') : `Offline · ${pending} colas`}
        {isSyncing && <RefreshCw className="w-3 h-3 animate-spin ml-1" />}
      </span>
    );
  }

  return (
    <div className={cn('flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold border', isOnline ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-amber-50 border-amber-300 text-amber-800')}>
      {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
      <span className="hidden sm:inline">{isOnline ? 'En línea' : 'Sin conexión'}</span>
      <Badge variant="secondary" className={cn('ml-1 text-[10px] px-1.5 py-0 h-5', pending > 0 ? 'bg-amber-500 text-white' : 'bg-emerald-500 text-white')}>
        {pending > 0 ? `${pending} pendientes` : <span className="flex items-center gap-1"><Cloud className="w-3 h-3" /> {synced} ok</span>}
      </Badge>
      {pending > 0 && isOnline && (
        <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] ml-1" onClick={() => syncNow()} disabled={isSyncing}>
          <RefreshCw className={cn('w-3 h-3 mr-1', isSyncing && 'animate-spin')} /> Sincronizar
        </Button>
      )}
    </div>
  );
}
