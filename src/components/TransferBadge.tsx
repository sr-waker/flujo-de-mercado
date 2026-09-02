import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Landmark, CheckCircle2, Clock3 } from 'lucide-react';
import { useTransferSync } from '@/hooks/useTransferSync';

export function TransferBadge({ compact = false }: { compact?: boolean }) {
  const { stats, approve, reject, pending } = useTransferSync(5000);
  const hasPending = stats.pending > 0;
  const title = hasPending
    ? `${stats.pending} transferencia${stats.pending > 1 ? 's' : ''} por confirmar — $${stats.pendingTotal.toLocaleString('es-AR')}`
    : `${stats.approved} transferencias confirmadas — $${stats.approvedTotal.toLocaleString('es-AR')}`;
  if (compact) {
    return (
      <Badge variant={hasPending ? 'default' : 'secondary'} className={hasPending ? 'bg-amber-500 text-white' : 'bg-emerald-600 text-white'} title={title}>
        <Landmark className="h-3 w-3 mr-1" />{hasPending ? `${stats.pending} por confirmar` : `${stats.approved} ok`}
      </Badge>
    );
  }
  return (
    <div className="flex items-center gap-2 text-xs" title={title}>
      <Badge variant={hasPending ? 'default' : 'secondary'} className={hasPending ? 'bg-amber-500 text-white' : 'bg-emerald-100 text-emerald-800'}>
        {hasPending ? <Clock3 className="h-3 w-3 mr-1" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
        {hasPending ? `${stats.pending} por confirmar` : `${stats.approved} confirmadas`}
      </Badge>
      <span className="text-muted-foreground hidden sm:inline">
        Pend. ${stats.pendingTotal.toLocaleString('es-AR')} · Aprob. ${stats.approvedTotal.toLocaleString('es-AR')}
      </span>
      {hasPending && pending[0] && (
        <Button size="sm" variant="outline" className="h-6 text-[11px]" onClick={() => approve(pending[0].id)}>Confirmar última</Button>
      )}
    </div>
  );
}
