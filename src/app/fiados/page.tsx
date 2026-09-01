
"use client";

import { useMemo, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { ClientOnly } from '@/components/ClientOnly';
import { 
  Search, 
  FolderPlus, 
  Folder, 
  Clock, 
  Trash2,
  Phone,
  Loader2,
  FolderOpen,
  CheckCircle,
  Printer,
  Coins,
  CreditCard,
  Smartphone,
  Banknote,
  CheckCircle2,
  History,
  ChevronRight,
  Sparkles,
  AlertTriangle,
  RefreshCw,
  ArrowRight,
  CopyX,
  ShieldCheck,
  Zap,
  Ghost
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useCollection, useFirestore, useMemoFirebase, useUser, errorEmitter, FirestorePermissionError } from '@/firebase';
import { collection, query, where, limit, getDocs, doc, writeBatch } from 'firebase/firestore';
import { Sale, Customer, PaymentMethod } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { useMarketStore } from '@/lib/store';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatCurrency } from '@/lib/utils';
import { downloadCustomerDebtTxt } from '@/lib/ticket-formatter';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { runCustomerAudit } from '@/ai/flows/customer-audit-flow';

export default function FiadosPage() {
  return (
    <ClientOnly>
      <AppLayout>
        <FiadosContent />
      </AppLayout>
    </ClientOnly>
  );
}

function FiadosContent() {
  const db = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  const { 
    addCustomer, 
    deleteCustomer,
    registerCascadingPayment,
    registerFullCustomerPayment,
  } = useMarketStore();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [isNewCustomerModalOpen, setIsNewCustomerModalOpen] = useState(false);
  const [newCustomerForm, setNewCustomerForm] = useState({ name: '', phone: '', notes: '' });
  
  const [selectedDebtor, setSelectedDebtor] = useState<Customer | null>(null);
  const [isAbonoModalOpen, setIsAbonoModalOpen] = useState(false);
  const [abonoAmount, setAbonoAmount] = useState('');
  const [abonoMethod, setAbonoMethod] = useState<PaymentMethod>('Efectivo');

  // Auditoría IA
  const [isAuditing, setIsAuditing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [auditResult, setAuditResult] = useState<any>(null);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);

  const customersQuery = useMemoFirebase(() => {
    if (!user || !db) return null;
    return query(collection(db, 'customers'), where('userId', '==', user.uid));
  }, [db, user?.uid]);

  const fiadosQuery = useMemoFirebase(() => {
    if (!user || !db) return null;
    return query(collection(db, 'sales'), where('userId', '==', user.uid), where('paymentMethod', '==', 'Fiado'));
  }, [db, user?.uid]);

  const activeShiftQuery = useMemoFirebase(() => {
    if (!user || !db) return null;
    return query(collection(db, 'shifts'), where('userId', '==', user.uid), where('isClosed', '==', false), limit(1));
  }, [db, user?.uid]);

  const { data: customers, isLoading: isCustomersLoading } = useCollection<Customer>(customersQuery);
  const { data: allFiados } = useCollection<Sale>(fiadosQuery);
  const { data: activeShifts } = useCollection<any>(activeShiftQuery);
  const activeSession = activeShifts?.[0];

  const filteredCustomers = useMemo(() => {
    if (!customers) return [];
    const list = [...customers].filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()));
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [customers, searchTerm]);

  const debtorStats = useMemo(() => {
    const stats: Record<string, { total: number; count: number; sales: Sale[] }> = {};
    (allFiados || []).forEach(sale => {
      const cId = sale.customerId || 'orphan';
      if (!stats[cId]) stats[cId] = { total: 0, count: 0, sales: [] };
      stats[cId].total += (Number(sale.total) || 0);
      stats[cId].count += 1;
      stats[cId].sales.push(sale);
    });
    return stats;
  }, [allFiados]);

  const globalTotalDebt = useMemo(() => {
    return (allFiados || []).reduce((acc, s) => acc + (Number(s.total) || 0), 0);
  }, [allFiados]);

  const performTechnicalCustomerAudit = async (userId: string, expectedTotalDebt: number) => {
    try {
      const customersQ = query(collection(db, "customers"), where("userId", "==", userId));
      const customersSnap = await getDocs(customersQ);
      
      const validCustomerIds = new Set(customersSnap.docs.map(doc => doc.id));
      const namesFound = new Map<string, string[]>();
      const duplicateCustomers: any[] = [];

      customersSnap.forEach(doc => {
        const data = doc.data();
        const name = data.name.toLowerCase().trim();
        if (namesFound.has(name)) {
          duplicateCustomers.push({ name: data.name, id: doc.id });
          namesFound.get(name)?.push(doc.id);
        } else {
          namesFound.set(name, [doc.id]);
        }
      });

      const salesQ = query(collection(db, "sales"), where("userId", "==", userId), where('paymentMethod', '==', 'Fiado'));
      const salesSnap = await getDocs(salesQ);
      
      let totalDebtInDB = 0;
      const fingerprints = new Map<string, string>();
      const duplicateSales: any[] = [];
      const orphanSales: any[] = [];

      salesSnap.forEach(doc => {
        const data = doc.data();
        const amount = Number(data.total) || 0;
        totalDebtInDB += amount;
        
        // Huella Digital: Monto + Cliente + Ventana de 2 segundos
        const timeWindow = Math.floor(data.timestamp / 2000);
        const fingerprint = `${amount}_${data.customerId}_${timeWindow}`;

        if (fingerprints.has(fingerprint)) {
          duplicateSales.push({ id: doc.id, total: amount, customer: data.customerName || 'N/A' });
        } else {
          fingerprints.set(fingerprint, doc.id);
        }

        // Detección de Huérfanos: El cliente del ticket ya no existe en la DB
        if (!data.customerId || !validCustomerIds.has(data.customerId)) {
          orphanSales.push({ id: doc.id, total: amount, customer: data.customerName || 'Manual/Eliminado' });
        }
      });

      const difference = Number((totalDebtInDB - expectedTotalDebt).toFixed(2));
      
      return {
        totalDebtCalculated: Number(totalDebtInDB.toFixed(2)),
        difference,
        duplicateCustomers,
        duplicateSales,
        orphanSales,
        hasIssue: Math.abs(difference) >= 0.1 || duplicateCustomers.length > 0 || duplicateSales.length > 0 || orphanSales.length > 0
      };
    } catch (e: any) {
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: 'customers/sales',
        operation: 'list'
      }));
      throw e;
    }
  };

  const handleRunAudit = async () => {
    if (isAuditing || !user) return;
    setIsAuditing(true);
    try {
      const techData = await performTechnicalCustomerAudit(user.uid, globalTotalDebt);

      try {
        const result = await runCustomerAudit({
          expectedTotalDebt: globalTotalDebt,
          totalDebtCalculated: techData.totalDebtCalculated,
          difference: techData.difference,
          duplicateCustomersCount: techData.duplicateCustomers.length,
          duplicateSalesCount: techData.duplicateSales.length,
          hasIssue: techData.hasIssue
        });

        setAuditResult({ ...techData, ...result, usingAi: true });
      } catch (aiError) {
        setAuditResult({
          ...techData,
          auditMessage: techData.orphanSales.length > 0 
            ? `Se detectaron ${techData.orphanSales.length} tickets huérfanos que suman ${formatCurrency(techData.orphanSales.reduce((a:any,b:any)=>a+b.total, 0))}. Estos tickets no pertenecen a ninguna carpeta activa.`
            : `Sincronización técnica requerida: Se detectó una discrepancia de ${formatCurrency(Math.abs(techData.difference))} en los registros físicos detectados.`,
          status: techData.hasIssue ? 'DISCREPANCIA' : 'CORRECTO',
          usingAi: false
        });
      }
    } catch (error) {
      toast({ title: "Error en Auditoría", variant: "destructive" });
    } finally {
      setIsAuditing(false);
      setIsAuditModalOpen(true);
    }
  };

  const handleMasterSyncAction = async () => {
    if (!auditResult || isSyncing) return;
    setIsSyncing(true);
    try {
      const batch = writeBatch(db);
      const toDelete = [...(auditResult.duplicateSales || []), ...(auditResult.orphanSales || [])];
      
      if (toDelete.length > 0) {
        toDelete.forEach(dup => {
          batch.delete(doc(db, 'sales', dup.id));
        });
        await batch.commit();
        toast({ title: "Sincronización Maestra Exitosa", description: "Los tickets huérfanos y duplicados han sido eliminados." });
      } else {
        toast({ title: "Sin Errores Cloud", description: "No se encontraron registros para purgar." });
      }
      setIsAuditModalOpen(false);
    } catch (e) {
      toast({ title: "Error en Sincronización", variant: "destructive" });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleAddCustomer = () => {
    if (!newCustomerForm.name) return;
    addCustomer(newCustomerForm.name, newCustomerForm.phone, newCustomerForm.notes);
    setIsNewCustomerModalOpen(false);
    setNewCustomerForm({ name: '', phone: '', notes: '' });
    toast({ title: "Cliente Registrado", description: "Carpeta de deudor creada exitosamente." });
  };

  const handleCascadingAbono = async () => {
    if (!selectedDebtor || !abonoAmount) return;
    const amount = parseFloat(abonoAmount);
    if (isNaN(amount) || amount <= 0) return;

    const stats = debtorStats[selectedDebtor.id];
    if (!stats || !stats.sales.length) return;

    registerCascadingPayment(
      activeSession?.id || null,
      selectedDebtor.id,
      stats.sales,
      amount,
      abonoMethod,
      selectedDebtor.name
    );

    toast({ title: "Abono Registrado", description: `Entrega de ${formatCurrency(amount)} procesada.` });
    setIsAbonoModalOpen(false);
    setAbonoAmount('');
  };

  const handleFullLiquidation = () => {
    if (!selectedDebtor) return;
    const stats = debtorStats[selectedDebtor.id];
    if (!stats || !stats.sales.length) return;

    if (!confirm(`¿Confirmar liquidación total de ${formatCurrency(stats.total)} para ${selectedDebtor.name}?`)) return;

    registerFullCustomerPayment(
      activeSession?.id || null,
      selectedDebtor.id,
      stats.sales,
      abonoMethod,
      selectedDebtor.name
    );

    toast({ title: "Deuda Liquidada", description: "Todos los tickets han sido saldados." });
    setSelectedDebtor(null);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-4xl font-black text-foreground tracking-tight">Archivo de Fiados</h1>
          <p className="text-muted-foreground mt-1 text-lg">Gestión de créditos personales y deudores.</p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <Button 
            onClick={handleRunAudit} 
            disabled={isAuditing}
            variant="outline"
            className="h-16 px-6 rounded-2xl font-black gap-2 border-emerald-500/30 text-emerald-600 hover:bg-emerald-50 shadow-sm"
          >
            {isAuditing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />} Auditor Cloud
          </Button>
          <Card className="rounded-2xl border-none bg-primary text-primary-foreground shadow-xl px-6 py-4 flex flex-col items-center">
            <span className="text-[10px] font-black uppercase tracking-widest opacity-70">Deuda Global</span>
            <span className="text-3xl font-black tracking-tighter">{formatCurrency(globalTotalDebt)}</span>
          </Card>
          <Button onClick={() => setIsNewCustomerModalOpen(true)} className="h-16 px-8 rounded-2xl font-bold gap-2">
            <FolderPlus className="w-5 h-5" /> Nueva Carpeta
          </Button>
        </div>
      </div>

      <div className="bg-card rounded-[2rem] shadow-xl overflow-hidden border-none p-8 border-b bg-muted/10 mb-8">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground w-5 h-5" />
          <Input 
            placeholder="Buscar deudor por nombre..." 
            className="pl-12 h-14 rounded-2xl bg-background border-none shadow-inner text-lg font-medium"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {isCustomersLoading ? (
          <div className="col-span-full h-40 flex items-center justify-center">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
          </div>
        ) : filteredCustomers.map((customer) => {
          const stats = debtorStats[customer.id] || { total: 0, count: 0 };
          return (
            <Card 
              key={customer.id} 
              className="rounded-3xl border-none shadow-xl bg-card hover:bg-muted/50 transition-all cursor-pointer group p-6 space-y-4" 
              onClick={() => setSelectedDebtor(customer)}
            >
              <div className="flex justify-between items-start">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                  <Folder className="w-6 h-6" />
                </div>
                {stats.total > 0 && (
                  <Badge variant="destructive" className="rounded-lg font-black text-xs px-2 bg-amber-600 border-none">
                    {formatCurrency(stats.total)}
                  </Badge>
                )}
              </div>
              <h3 className="text-xl font-black truncate">{customer.name}</h3>
              <p className="text-[10px] font-bold uppercase text-muted-foreground">{stats.count} Tickets Pendientes</p>
              
              <div className="flex gap-2 pt-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="flex-1 rounded-xl font-bold border-emerald-500 text-emerald-600 hover:bg-emerald-500 hover:text-white transition-colors gap-2"
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    setSelectedDebtor(customer); 
                    setIsAbonoModalOpen(true); 
                  }}
                  disabled={stats.total <= 0}
                >
                  <Coins className="w-4 h-4" /> Abonar
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-xl hover:bg-primary/10 hover:text-primary transition-colors"
                  onClick={(e) => { e.stopPropagation(); setSelectedDebtor(customer); }}
                >
                  <ChevronRight className="w-5 h-5" />
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      {/* MODAL AUDITORIA IA + RESPALDO */}
      <Dialog open={isAuditModalOpen} onOpenChange={setIsAuditModalOpen}>
        <DialogContent className="max-w-3xl rounded-[2.5rem] border-none shadow-2xl p-0 overflow-hidden">
          <div className={cn("p-8 text-white text-center", auditResult?.status === 'CORRECTO' ? "bg-emerald-500" : "bg-amber-500")}>
            <div className="flex justify-center mb-4">{auditResult?.status === 'CORRECTO' ? <CheckCircle2 className="w-16 h-16" /> : <AlertTriangle className="w-16 h-16" />}</div>
            <DialogTitle className="text-3xl font-black tracking-tight">Informe de Integridad Fiados</DialogTitle>
            <p className="text-white/80 font-bold mt-1 uppercase text-xs tracking-widest">
              {auditResult?.usingAi === false ? 'Diagnóstico de Fuga Detectada' : 'Arqueo por Inteligencia Artificial'}
            </p>
          </div>
          
          <div className="p-8 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-muted/30 p-4 rounded-2xl border border-border/50 text-center">
                <p className="text-[10px] font-black text-muted-foreground uppercase mb-1">Recuento Real</p>
                <p className="text-lg font-black text-primary">{formatCurrency(auditResult?.totalDebtCalculated || 0)}</p>
              </div>
              <div className="bg-muted/30 p-4 rounded-2xl border border-border/50 text-center">
                <p className="text-[10px] font-black text-muted-foreground uppercase mb-1">Duplicados</p>
                <p className="text-lg font-black text-destructive">{auditResult?.duplicateSales?.length || 0}</p>
              </div>
              <div className="bg-muted/30 p-4 rounded-2xl border border-border/50 text-center ring-2 ring-amber-500/20">
                <p className="text-[10px] font-black text-amber-600 uppercase mb-1">Huérfanos</p>
                <p className="text-lg font-black text-amber-600">{auditResult?.orphanSales?.length || 0}</p>
                <p className="text-[8px] font-bold text-amber-500 mt-1">SIN CARPETA</p>
              </div>
              <div className="bg-muted/30 p-4 rounded-2xl border border-border/50 text-center">
                <p className="text-[10px] font-black text-muted-foreground uppercase mb-1">Diferencia</p>
                <p className="text-lg font-black text-destructive">{formatCurrency(Math.abs(auditResult?.difference || 0))}</p>
              </div>
            </div>

            {auditResult?.status !== 'CORRECTO' && (
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between animate-in zoom-in-95 duration-500">
                <div className="flex items-center gap-3">
                  <RefreshCw className={cn("w-5 h-5 text-amber-600", isSyncing && "animate-spin")} />
                  <div>
                    <p className="text-xs font-black uppercase text-amber-700">Fuga Cloud Identificada</p>
                    <p className="text-[10px] font-bold text-amber-600 leading-tight">Presiona el botón para purgar registros fantasma.</p>
                  </div>
                </div>
                <Button 
                  disabled={isSyncing}
                  size="sm" 
                  className="rounded-lg h-10 px-4 text-[10px] font-black uppercase bg-amber-600 hover:bg-amber-700 shadow-lg gap-2" 
                  onClick={handleMasterSyncAction}
                >
                  {isSyncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />} Sincronización Maestra
                </Button>
              </div>
            )}

            <div className="p-5 rounded-2xl bg-primary/5 border border-primary/10">
              <h4 className="text-xs font-black text-primary uppercase mb-2 flex items-center gap-2">
                {auditResult?.usingAi === false ? <ShieldCheck className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />} 
                {auditResult?.usingAi === false ? 'Veredicto de Reparación' : 'Veredicto IA'}
              </h4>
              <p className="text-sm font-bold leading-relaxed italic">"{auditResult?.auditMessage}"</p>
            </div>

            {(auditResult?.orphanSales?.length > 0 || auditResult?.duplicateSales?.length > 0) && (
              <div className="space-y-3">
                <h4 className="text-xs font-black text-destructive uppercase flex items-center gap-2"><Ghost className="w-4 h-4" /> Registros para Purgar ({ (auditResult?.orphanSales?.length || 0) + (auditResult?.duplicateSales?.length || 0) })</h4>
                <ScrollArea className="h-40 w-full rounded-xl border border-destructive/20 bg-muted/10">
                  <div className="p-4 space-y-2">
                    {auditResult?.orphanSales?.map((dup: any, i: number) => (
                      <div key={`orphan-${i}`} className="flex justify-between items-center text-[11px] p-2 bg-amber-500/5 rounded-lg border border-amber-500/10">
                        <span className="font-bold flex items-center gap-2"><Ghost className="w-3 h-3" /> Huérfano: {dup.customer}</span>
                        <span className="font-black text-amber-600">{formatCurrency(dup.total)}</span>
                      </div>
                    ))}
                    {auditResult?.duplicateSales?.map((dup: any, i: number) => (
                      <div key={`dup-${i}`} className="flex justify-between items-center text-[11px] p-2 bg-destructive/5 rounded-lg border border-destructive/10">
                        <span className="font-bold flex items-center gap-2"><CopyX className="w-3 h-3" /> Duplicado: {dup.customer}</span>
                        <span className="font-black text-destructive">{formatCurrency(dup.total)}</span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>

          <DialogFooter className="p-8 pt-0">
            <Button onClick={() => setIsAuditModalOpen(false)} className="w-full h-14 rounded-2xl font-black uppercase text-lg">Cerrar Auditoría</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL DETALLE DEL DEUDOR */}
      <Dialog open={!!selectedDebtor && !isAbonoModalOpen} onOpenChange={(open) => !open && setSelectedDebtor(null)}>
        <DialogContent className="max-w-4xl rounded-[2.5rem] border-none shadow-2xl p-0 overflow-hidden h-[85vh] flex flex-col">
          <div className="bg-primary p-8 text-primary-foreground shrink-0 relative overflow-hidden">
            <div className="relative z-10 flex justify-between items-start">
              <div>
                <DialogTitle className="text-3xl font-black">{selectedDebtor?.name || 'Deudor'}</DialogTitle>
                <DialogDescription className="text-primary-foreground/80 font-bold mt-1">
                  Deuda Total: {formatCurrency(debtorStats[selectedDebtor?.id || '']?.total || 0)}
                </DialogDescription>
              </div>
              <div className="flex gap-2">
                <Button 
                  onClick={() => setIsAbonoModalOpen(true)}
                  disabled={!debtorStats[selectedDebtor?.id || '']?.total}
                  className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-black uppercase text-[10px] h-10 px-4 gap-2"
                >
                  <Coins className="w-4 h-4" /> Entregar Abono
                </Button>
                <Button 
                  variant="outline"
                  onClick={handleFullLiquidation}
                  disabled={!debtorStats[selectedDebtor?.id || '']?.total}
                  className="bg-white/10 border-white/20 hover:bg-white/20 text-white rounded-xl font-black uppercase text-[10px] h-10 px-4 gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" /> Liquidar Todo
                </Button>
              </div>
            </div>
            <div className="absolute -right-10 -bottom-10 opacity-10 pointer-events-none">
              <FolderOpen className="w-48 h-48" />
            </div>
          </div>
          
          <ScrollArea className="flex-1 p-6">
            <div className="space-y-3">
              {selectedDebtor && (debtorStats[selectedDebtor.id]?.sales || []).length > 0 ? (
                [...debtorStats[selectedDebtor.id].sales].sort((a,b) => b.timestamp - a.timestamp).map(sale => (
                  <div key={sale.id} className="p-4 rounded-xl bg-muted/40 flex justify-between items-center hover:bg-muted/60 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-600">
                        <Clock className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="font-bold text-xs">Ticket #{sale.id.slice(-4).toUpperCase()}</p>
                        <p className="text-[10px] text-muted-foreground font-medium">{format(sale.timestamp, 'dd/MM HH:mm', { locale: es })}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-amber-600 text-lg tracking-tighter">
                        {formatCurrency(sale.total)}
                      </p>
                      {sale.initialTotal && sale.initialTotal > sale.total && (
                        <p className="text-[8px] text-muted-foreground line-through">Inicial: {formatCurrency(sale.initialTotal)}</p>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="h-60 flex flex-col items-center justify-center text-muted-foreground opacity-30">
                  <CheckCircle className="w-12 h-12 mb-2" />
                  <p className="font-bold">Sin deuda pendiente</p>
                </div>
              )}
            </div>
          </ScrollArea>
          
          <div className="p-6 bg-muted/30 border-t flex gap-3 shrink-0">
            <Button 
              onClick={() => selectedDebtor && downloadCustomerDebtTxt(selectedDebtor, debtorStats[selectedDebtor.id]?.sales || [])} 
              className="flex-1 h-12 font-bold gap-2 rounded-xl"
              disabled={!selectedDebtor || !debtorStats[selectedDebtor.id]?.sales.length}
            >
              Imprimir Resumen <Printer className="w-4 h-4" />
            </Button>
            <Button 
              variant="outline" 
              onClick={() => { if(selectedDebtor && confirm("¿Borrar carpeta?")) { deleteCustomer(selectedDebtor.id); setSelectedDebtor(null); } }} 
              className="h-12 font-bold rounded-xl text-destructive hover:bg-destructive/10"
            >
              Borrar Carpeta
            </Button>
            <Button variant="outline" onClick={() => setSelectedDebtor(null)} className="h-12 font-bold rounded-xl border-muted-foreground/20">
              Cerrar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* MODAL ABONO EN CASCADA */}
      <Dialog open={isAbonoModalOpen} onOpenChange={(open) => {
        setIsAbonoModalOpen(open);
        if (!open && !selectedDebtor) setSelectedDebtor(null);
      }}>
        <DialogContent className="max-w-md rounded-[2.5rem] p-0 overflow-hidden border-none shadow-2xl">
          <div className="bg-emerald-500 p-6 text-white text-center">
            <DialogTitle className="text-2xl font-black">Recibir Abono</DialogTitle>
            <p className="text-white/80 font-bold mt-1 uppercase text-[10px] tracking-widest">Cobro inteligente en cascada</p>
          </div>
          <div className="p-8 space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-muted-foreground">Monto de la Entrega ($)</Label>
                <Input 
                  type="number" 
                  placeholder="0.00" 
                  value={abonoAmount}
                  onChange={(e) => setAbonoAmount(e.target.value)}
                  className="h-14 rounded-2xl bg-muted/30 border-none text-2xl font-black text-emerald-600 text-center"
                  autoFocus
                />
              </div>
              
              <div className="space-y-3">
                <Label className="text-[10px] font-black uppercase text-muted-foreground">Método de Cobro</Label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'Efectivo', icon: Banknote },
                    { id: 'Transferencia', icon: Smartphone },
                    { id: 'Tarjeta', icon: CreditCard }
                  ].map(method => (
                    <Button 
                      key={method.id}
                      variant={abonoMethod === method.id ? "default" : "outline"}
                      onClick={() => setAbonoMethod(method.id as any)}
                      className={cn(
                        "h-12 rounded-xl flex flex-col items-center justify-center p-0 gap-1",
                        abonoMethod === method.id ? "bg-emerald-600 border-none" : ""
                      )}
                    >
                      <method.icon className="w-4 h-4" />
                      <span className="text-[8px] font-black uppercase">{method.id}</span>
                    </Button>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/20">
              <p className="text-[10px] text-muted-foreground leading-relaxed italic">
                El monto se aplicará automáticamente a los tickets <strong>más antiguos</strong> primero de {selectedDebtor?.name}.
              </p>
            </div>
          </div>
          <DialogFooter className="p-8 pt-0">
            <Button 
              onClick={handleCascadingAbono} 
              disabled={!abonoAmount || parseFloat(abonoAmount) <= 0} 
              className="w-full h-14 rounded-2xl text-lg font-black uppercase shadow-xl bg-emerald-600 hover:bg-emerald-700"
            >
              Confirmar Entrega
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL NUEVO CLIENTE */}
      <Dialog open={isNewCustomerModalOpen} onOpenChange={setIsNewCustomerModalOpen}>
        <DialogContent className="max-w-md rounded-[2.5rem] p-0 overflow-hidden border-none shadow-2xl">
          <div className="bg-primary p-6 text-white text-center">
            <DialogTitle className="text-2xl font-black">Nueva Carpeta</DialogTitle>
            <p className="text-white/80 font-bold mt-1 uppercase text-[10px] tracking-widest">Apertura de Crédito Personal</p>
          </div>
          <div className="p-8 space-y-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase text-muted-foreground">Nombre del Cliente</Label>
              <Input 
                placeholder="Ej: Doña Rosa" 
                value={newCustomerForm.name} 
                onChange={e => setNewCustomerForm({...newCustomerForm, name: e.target.value})} 
                className="h-12"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase text-muted-foreground">Teléfono (Opcional)</Label>
              <Input 
                placeholder="221..." 
                value={newCustomerForm.phone} 
                onChange={e => setNewCustomerForm({...newCustomerForm, phone: e.target.value})} 
                className="h-12"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase text-muted-foreground">Notas Internas</Label>
              <Input 
                placeholder="Ej: Vecina de la esquina" 
                value={newCustomerForm.notes} 
                onChange={e => setNewCustomerForm({...newCustomerForm, notes: e.target.value})} 
                className="h-12"
              />
            </div>
          </div>
          <DialogFooter className="p-8 pt-0">
            <Button onClick={handleAddCustomer} disabled={!newCustomerForm.name} className="w-full h-14 rounded-2xl text-lg font-black uppercase">
              Abrir Carpeta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
