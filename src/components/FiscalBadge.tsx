"use client";
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useFiscalSync, syncPendingAfip } from '@/hooks/useFiscalSync';
import { FileCheck2, Clock3, AlertTriangle, RefreshCw } from 'lucide-react';
import { useState } from 'react';

export function FiscalBadge() {
  const { stats, refresh, hasPendingCae } = useFiscalSync();
  const [syncing, setSyncing] = useState(false);
  const handleSync = async () => {
    setSyncing(true);
    try {
      // Push stub: en prod reemplazar por fetch WSFE real; aquí mock CAE para demo offline
      await syncPendingAfip(async () => ({ cae: `CAE-${Date.now()}`, caeVto: new Date(Date.now()+10*864e5).toISOString().slice(0,10) }));
      await refresh();
    } finally { setSyncing(false); }
  };
  if (!hasPendingCae && stats.error === 0 && stats.sent === 0) return null;
  if (hasPendingCae) {
    return (
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="gap-1 bg-amber-500 text-white border-amber-600">
          <Clock3 className="w-3 h-3" /> {stats.pending} CAE pendiente{stats.pending!==1?'s':''}
        </Badge>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleSync} disabled={syncing}>
          <RefreshCw className={`w-3 h-3 mr-1 ${syncing?'animate-spin':''}`} /> Sincronizar CAE
        </Button>
        {stats.error>0 && <Badge variant="destructive" className="gap-1"><AlertTriangle className="w-3 h-3"/>{stats.error} error</Badge>}
      </div>
    );
  }
  if (stats.error>0) return <Badge variant="destructive" className="gap-1"><AlertTriangle className="w-3 h-3"/>{stats.error} CAE con error</Badge>;
  return <Badge className="gap-1 bg-emerald-600"><FileCheck2 className="w-3 h-3"/>{stats.sent} CAE ok</Badge>;
}
