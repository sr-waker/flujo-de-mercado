
"use client";

import { useState, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { ClientOnly } from '@/components/ClientOnly';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as ChartTooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { 
  TrendingUp, 
  History as HistoryIcon,
  Loader2,
  ShoppingCart,
  Calendar as CalendarIcon,
  Wallet,
  Coins,
  SearchCheck,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  CopyX,
  Sparkles,
  PieChart as PieChartIcon,
  RefreshCw,
  ArrowRight,
  HandCoins,
  UserPlus,
  Filter,
  ShieldCheck,
  Printer
} from 'lucide-react';
import { 
  format, 
  startOfDay, 
  startOfWeek, 
  startOfMonth, 
  endOfDay,
  eachDayOfInterval,
} from 'date-fns';
import { es } from 'date-fns/locale';
import { useCollection, useFirestore, useMemoFirebase, useUser, errorEmitter, FirestorePermissionError } from '@/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { Sale, Expense, Purchase, SupplierDebt } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn, formatCurrency } from '@/lib/utils';
import { runFinancialAudit } from '@/ai/flows/financial-auditor-flow';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useMarketStore } from '@/lib/store';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { downloadTicketTxt } from '@/lib/ticket-formatter';

type Period = 'day' | 'week' | 'month';
type ListFilter = 'all' | 'ingresos' | 'egresos' | 'fiados' | 'deudas';

const COLORS = {
  ingresos: 'hsl(var(--primary))',
  egresos: 'hsl(var(--destructive))',
  deudas: '#f59e0b',
  fiados: '#31bde5',
};

const USER_MANUAL_COUNT = 1311934;

export default function HistoryPage() {
  return (
    <ClientOnly>
      <AppLayout>
        <HistoryContent />
      </AppLayout>
    </ClientOnly>
  );
}

function HistoryContent() {
  const db = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  const { deleteSale, deleteExpense, deletePurchase, deleteSupplierDebt, triggerMasterCloudSync } = useMarketStore();
  
  const [period, setPeriod] = useState<Period>('week');
  const [listFilter, setListFilter] = useState<ListFilter>('all');
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditResult, setAuditResult] = useState<any>(null);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [showDonut, setShowDonut] = useState(false);

  const fetchInterval = useMemo(() => {
    const now = new Date();
    let start: Date;
    let end: Date = endOfDay(now);

    if (period === 'day') start = startOfDay(now);
    else if (period === 'week') start = startOfWeek(now, { weekStartsOn: 1 });
    else start = startOfMonth(now);

    return { start, end };
  }, [period]);

  const salesQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(collection(db, 'sales'), where('userId', '==', user.uid));
  }, [db, user?.uid]);

  const expensesQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(collection(db, 'expenses'), where('userId', '==', user.uid));
  }, [db, user?.uid]);

  const purchasesQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(collection(db, 'purchases'), where('userId', '==', user.uid));
  }, [db, user?.uid]);

  const debtsQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(collection(db, 'supplier_debts'), where('userId', '==', user.uid));
  }, [db, user?.uid]);
  
  const { data: salesRaw, isLoading: isSalesLoading } = useCollection<Sale>(salesQuery);
  const { data: expensesRaw, isLoading: isExpensesLoading } = useCollection<Expense>(expensesQuery);
  const { data: purchasesRaw, isLoading: isPurchasesLoading } = useCollection<Purchase>(purchasesQuery);
  const { data: debtsRaw, isLoading: isDebtsLoading } = useCollection<SupplierDebt>(debtsQuery);

  const statsData = useMemo(() => {
    const startMs = fetchInterval.start.getTime();
    const endMs = fetchInterval.end.getTime();

    const fSales = (salesRaw || []).filter(s => s.timestamp >= startMs && s.timestamp <= endMs);
    const fExpenses = (expensesRaw || []).filter(e => e.timestamp >= startMs && e.timestamp <= endMs);
    const fPurchases = (purchasesRaw || []).filter(p => p.timestamp >= startMs && p.timestamp <= endMs);

    const ingresosPeriodo = fSales.filter(s => s.paymentMethod !== 'Fiado').reduce((acc, s) => acc + (s.total || 0), 0);
    const egresosPeriodo = fExpenses.reduce((acc, e) => acc + (e.amount || 0), 0) + fPurchases.filter(p => p.paymentType === 'paid').reduce((acc, p) => acc + (p.total || 0), 0);

    const deudasGlobales = (debtsRaw || []).filter(d => !d.isPaid).reduce((acc, d) => acc + (Number(d.amount) || 0), 0);
    const fiadosGlobales = (salesRaw || []).filter(s => s.paymentMethod === 'Fiado').reduce((acc, s) => acc + (s.total || 0), 0);

    const movementsInPeriod = [
      ...fSales.map(s => ({ 
        ...s, 
        type: 'sale' as const, 
        filterCategory: s.paymentMethod === 'Fiado' ? 'fiados' : 'ingresos' 
      })),
      ...fExpenses.map(e => ({ 
        ...e, 
        type: 'expense' as const, 
        total: e.amount, 
        name: e.concept, 
        category: e.category,
        filterCategory: 'egresos' 
      })),
      ...fPurchases.map(p => ({ 
        ...p, 
        type: 'purchase' as const, 
        total: p.total, 
        name: `Stock: ${p.supplierName}`, 
        category: 'Mercadería',
        filterCategory: 'egresos' 
      }))
    ].sort((a, b) => b.timestamp - a.timestamp);

    const chartData = eachDayOfInterval({
      start: fetchInterval.start,
      end: fetchInterval.end
    }).map(day => {
      const dayStart = startOfDay(day).getTime();
      const dayEnd = endOfDay(day).getTime();
      const daySales = fSales
        .filter(s => s.timestamp >= dayStart && s.timestamp <= dayEnd && s.paymentMethod !== 'Fiado')
        .reduce((acc, s) => acc + (s.total || 0), 0);
      
      return {
        date: format(day, period === 'month' ? 'dd/MM' : 'EEEE', { locale: es }),
        ventas: daySales
      };
    });

    const donutData = [
      { name: 'Ingresos', value: ingresosPeriodo, color: COLORS.ingresos },
      { name: 'Egresos', value: egresosPeriodo, color: COLORS.egresos },
      { name: 'Deudas (Prov)', value: deudasGlobales, color: COLORS.deudas },
      { name: 'Fiados (Cli)', value: fiadosGlobales, color: COLORS.fiados },
    ].filter(d => d.value > 0);

    return { 
      ingresos: ingresosPeriodo, 
      egresos: egresosPeriodo, 
      deudas: deudasGlobales, 
      fiados: fiadosGlobales, 
      movements: movementsInPeriod, 
      chartData, 
      donutData,
      netBalance: ingresosPeriodo - egresosPeriodo,
      start: fetchInterval.start, 
      end: fetchInterval.end 
    };
  }, [salesRaw, expensesRaw, purchasesRaw, debtsRaw, fetchInterval, period]);

  const filteredMovements = useMemo(() => {
    if (listFilter === 'fiados') {
      return (salesRaw || [])
        .filter(s => s.paymentMethod === 'Fiado')
        .map(s => ({ ...s, type: 'sale' as const, filterCategory: 'fiados' }))
        .sort((a, b) => b.timestamp - a.timestamp);
    }
    if (listFilter === 'deudas') {
      return (debtsRaw || [])
        .filter(d => !d.isPaid)
        .map(d => ({ ...d, type: 'debt' as const, total: d.amount, name: `Deuda: ${d.supplierName}`, filterCategory: 'deudas' }))
        .sort((a, b) => b.timestamp - a.timestamp);
    }

    if (listFilter === 'all') return statsData.movements;
    return statsData.movements.filter(m => (m as any).filterCategory === listFilter);
  }, [statsData.movements, listFilter, salesRaw, debtsRaw]);

  // Auditoría Técnica (Lado Cliente)
  const performTechnicalFinancialAudit = async (userId: string, start: number, end: number, expectedNet: number = 0) => {
    try {
      const salesQ = query(collection(db, "sales"), where("userId", "==", userId));
      const salesSnap = await getDocs(salesQ);
      
      let totalSales = 0;
      let salesCount = 0;
      const fingerprintsFound = new Map<string, string>();
      const duplicates: any[] = [];

      salesSnap.forEach(doc => {
        const data = doc.data();
        if (data.timestamp >= start && data.timestamp <= end) {
          const fingerprint = `${data.total}_${data.timestamp}_${(data.items || []).length}`;
          if (fingerprintsFound.has(fingerprint)) {
            duplicates.push({ id: doc.id, total: data.total, timestamp: data.timestamp, type: 'Venta', customer: data.customerName || 'Final' });
          } else {
            fingerprintsFound.set(fingerprint, doc.id);
            if (data.paymentMethod !== 'Fiado') {
              totalSales += (Number(data.total) || 0);
              salesCount++;
            }
          }
        }
      });

      const expQ = query(collection(db, "expenses"), where("userId", "==", userId));
      const expSnap = await getDocs(expQ);
      let totalExpenses = 0;
      let expensesCount = 0;
      expSnap.forEach(doc => {
        const data = doc.data();
        if (data.timestamp >= start && data.timestamp <= end) {
          totalExpenses += (Number(data.amount) || 0);
          expensesCount++;
        }
      });

      const purQ = query(collection(db, "purchases"), where("userId", "==", userId));
      const purSnap = await getDocs(purQ);
      let totalPurchases = 0;
      let purchasesCount = 0;
      purSnap.forEach(doc => {
        const data = doc.data();
        if (data.timestamp >= start && data.timestamp <= end && data.paymentType === 'paid') {
          totalPurchases += (Number(data.total) || 0);
          purchasesCount++;
        }
      });

      const netBalance = Number((totalSales - totalExpenses - totalPurchases).toFixed(2));
      const difference = Number((netBalance - expectedNet).toFixed(2));

      return {
        salesCount,
        expensesCount,
        purchasesCount,
        totalSalesAudited: Number(totalSales.toFixed(2)),
        totalExpensesAudited: Number(totalExpenses.toFixed(2)),
        totalPurchasesAudited: Number(totalPurchases.toFixed(2)),
        netBalanceAudited: netBalance,
        difference,
        duplicatesDetected: duplicates,
        hasIssue: Math.abs(difference) >= 0.1 || duplicates.length > 0
      };
    } catch (e: any) {
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: 'sales/expenses/purchases',
        operation: 'list'
      }));
      throw e;
    }
  };

  const handleRunAudit = async () => {
    if (isAuditing || !user) return;
    setIsAuditing(true);
    try {
      const techData = await performTechnicalFinancialAudit(
        user.uid, 
        statsData.start.getTime(), 
        statsData.end.getTime(), 
        statsData.netBalance
      );

      const result = await runFinancialAudit({
        expectedNet: statsData.netBalance,
        netBalanceAudited: techData.netBalanceAudited,
        difference: techData.difference,
        duplicatesCount: techData.duplicatesDetected.length,
        hasIssue: techData.hasIssue
      });

      setAuditResult({
        ...techData,
        ...result,
        usingAi: result.usingAi
      });
    } catch (error: any) {
      toast({ title: "Error en Auditoría", variant: "destructive" });
    } finally {
      setIsAuditing(false);
      setIsAuditModalOpen(true);
    }
  };

  const handleMasterSyncAction = async () => {
    if (!auditResult || !auditResult.duplicatesDetected) return;
    try {
      await triggerMasterCloudSync(auditResult.duplicatesDetected);
      toast({ title: "Sincronización Exitosa", description: "Se han eliminado los duplicados y recalibrado el balance." });
      setIsAuditModalOpen(false);
    } catch (e) {
      toast({ title: "Error en Sincronización", variant: "destructive" });
    }
  };

  const handleDelete = (m: any) => {
    if (!confirm("¿Eliminar este registro permanentemente?")) return;
    if (m.type === 'sale') deleteSale(m.id);
    else if (m.type === 'expense') deleteExpense(m.id);
    else if (m.type === 'purchase') deletePurchase(m.id);
    else if (m.type === 'debt') deleteSupplierDebt(m.id);
    toast({ title: "Registro eliminado" });
  };

  if (isSalesLoading || isExpensesLoading || isPurchasesLoading || isDebtsLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
        <p className="text-muted-foreground font-medium">Sincronizando historial cloud...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6">
        <div>
          <h1 className="text-4xl font-black text-foreground tracking-tight">Historial Cloud</h1>
          <p className="text-muted-foreground mt-1 text-lg">Auditoría detallada de movimientos y flujo de caja.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-4 w-full sm:w-auto">
          <div className="flex items-center gap-2 bg-muted/50 p-2 rounded-xl border border-border/50">
            <Label htmlFor="chart-mode" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground cursor-pointer flex items-center gap-2">
              {showDonut ? <PieChartIcon className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
              {showDonut ? 'Distribución' : 'Tendencia'}
            </Label>
            <Switch id="chart-mode" checked={showDonut} onCheckedChange={setShowDonut} />
          </div>

          <Tabs value={period} onValueChange={(v: any) => setPeriod(v)} className="bg-muted p-1 rounded-xl shadow-inner">
            <TabsList className="bg-transparent border-none p-0 h-auto gap-1">
              <TabsTrigger value="day" className="rounded-lg px-4 font-bold uppercase text-[10px] py-2">Hoy</TabsTrigger>
              <TabsTrigger value="week" className="rounded-lg px-4 font-bold uppercase text-[10px] py-2">Semana</TabsTrigger>
              <TabsTrigger value="month" className="rounded-lg px-4 font-bold uppercase text-[10px] py-2">Mes</TabsTrigger>
            </TabsList>
          </Tabs>
          
          <Button 
            onClick={handleRunAudit} 
            disabled={isAuditing} 
            className="rounded-xl h-10 px-6 gap-2 font-black shadow-lg bg-emerald-600 hover:bg-emerald-700 transition-all"
          >
            {isAuditing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Auditor IA
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="rounded-2xl border-none bg-primary text-primary-foreground shadow-xl">
          <CardHeader className="pb-2">
            <CardDescription className="text-primary-foreground/70 font-black uppercase text-[10px] tracking-widest">Ingresos Reales</CardDescription>
            <CardTitle className="text-2xl font-black">{formatCurrency(statsData.ingresos)}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="rounded-2xl border-none bg-card shadow-xl border-t-4 border-destructive">
          <CardHeader className="pb-2">
            <CardDescription className="text-muted-foreground font-black uppercase text-[10px] tracking-widest">Salidas de Caja</CardDescription>
            <CardTitle className="text-2xl font-black text-destructive">-{formatCurrency(statsData.egresos)}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="rounded-2xl border-none bg-card shadow-xl border-t-4 border-amber-500">
          <CardHeader className="pb-2">
            <CardDescription className="text-muted-foreground font-black uppercase text-[10px] tracking-widest">Deudas (Global)</CardDescription>
            <CardTitle className="text-2xl font-black text-amber-600">{formatCurrency(statsData.deudas)}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="rounded-2xl border-none bg-card shadow-xl border-t-4 border-accent">
          <CardHeader className="pb-2">
            <CardDescription className="text-muted-foreground font-black uppercase text-[10px] tracking-widest">Fiados (Global)</CardDescription>
            <CardTitle className="text-2xl font-black text-accent-foreground">{formatCurrency(statsData.fiados)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card className="rounded-[2.5rem] border-none shadow-2xl bg-card overflow-hidden">
        <CardHeader className="p-8 pb-0">
          <CardTitle className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
            {showDonut ? <PieChartIcon className="text-primary w-5 h-5" /> : <TrendingUp className="text-primary w-5 h-5" />}
            {showDonut ? 'Distribución Financiera' : 'Tendencia de Ventas'}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-8 pt-4">
          <div className="h-[400px] w-full flex items-center justify-center">
            {showDonut ? (
              <div className="relative w-full h-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statsData.donutData}
                      cx="50%"
                      cy="50%"
                      innerRadius={110}
                      outerRadius={150}
                      paddingAngle={8}
                      dataKey="value"
                      animationBegin={0}
                      animationDuration={1500}
                    >
                      {statsData.donutData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                      ))}
                    </Pie>
                    <ChartTooltip 
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          const percent = ((data.value / statsData.donutData.reduce((a,b) => a + b.value, 0)) * 100).toFixed(1);
                          return (
                            <div className="bg-card p-4 rounded-2xl shadow-2xl border border-border/50 animate-in zoom-in-95 duration-200">
                              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">{data.name}</p>
                              <p className="text-xl font-black text-foreground">{formatCurrency(data.value)}</p>
                              <p className="text-xs font-bold text-primary mt-1">{percent}% del total operativo</p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Balance Neto</span>
                  <span className={cn("text-3xl font-black tracking-tighter", statsData.netBalance >= 0 ? "text-emerald-500" : "text-destructive")}>
                    {formatCurrency(statsData.netBalance)}
                  </span>
                </div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={statsData.chartData}>
                  <defs>
                    <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted-foreground)/0.1)" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: 'hsl(var(--muted-foreground))', fontSize: 10, fontWeight: 'bold'}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fill: 'hsl(var(--muted-foreground))', fontSize: 10}} tickFormatter={(val) => `$${(val/1000).toFixed(0)}k`} />
                  <ChartTooltip contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)'}} formatter={(val: number) => [formatCurrency(val), 'Ventas']} />
                  <Area type="monotone" dataKey="ventas" stroke="hsl(var(--primary))" strokeWidth={4} fillOpacity={1} fill="url(#colorSales)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-[2.5rem] border-none shadow-2xl bg-card overflow-hidden">
        <div className="p-6 border-b bg-muted/20 space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <h2 className="text-xl font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <HistoryIcon className="w-5 h-5" /> Movimientos Recientes
            </h2>
            <Badge variant="secondary" className="font-bold">{filteredMovements.length} REGISTROS</Badge>
          </div>

          <Tabs value={listFilter} onValueChange={(v: any) => setListFilter(v)} className="w-full">
            <TabsList className="bg-background/50 p-1 rounded-xl shadow-inner flex h-auto overflow-x-auto justify-start sm:justify-center border border-border/40 gap-1">
              <TabsTrigger value="all" className="rounded-lg px-4 font-bold uppercase text-[9px] tracking-tight py-3 gap-2 flex-1 sm:flex-none">
                <Filter className="w-3 h-3" /> Todos
              </TabsTrigger>
              <TabsTrigger value="ingresos" className="rounded-lg px-4 font-bold uppercase text-[9px] tracking-tight py-3 gap-2 flex-1 sm:flex-none data-[state=active]:bg-primary data-[state=active]:text-white">
                <div className="flex flex-col items-center">
                  <div className="flex items-center gap-1.5"><Coins className="w-3 h-3" /> Ingresos</div>
                  <span className="text-[8px] opacity-70">{formatCurrency(statsData.ingresos)}</span>
                </div>
              </TabsTrigger>
              <TabsTrigger value="egresos" className="rounded-lg px-4 font-bold uppercase text-[9px] tracking-tight py-3 gap-2 flex-1 sm:flex-none data-[state=active]:bg-destructive data-[state=active]:text-white">
                <div className="flex flex-col items-center">
                  <div className="flex items-center gap-1.5"><Wallet className="w-3 h-3" /> Egresos</div>
                  <span className="text-[8px] opacity-70">-{formatCurrency(statsData.egresos)}</span>
                </div>
              </TabsTrigger>
              <TabsTrigger value="fiados" className="rounded-lg px-4 font-bold uppercase text-[9px] tracking-tight py-3 gap-2 flex-1 sm:flex-none data-[state=active]:bg-accent data-[state=active]:text-white">
                <div className="flex flex-col items-center">
                  <div className="flex items-center gap-1.5"><UserPlus className="w-3 h-3" /> Fiados</div>
                  <span className="text-[8px] opacity-70">{formatCurrency(statsData.fiados)}</span>
                </div>
              </TabsTrigger>
              <TabsTrigger value="deudas" className="rounded-lg px-4 font-bold uppercase text-[9px] tracking-tight py-3 gap-2 flex-1 sm:flex-none data-[state=active]:bg-amber-500 data-[state=active]:text-white">
                <div className="flex flex-col items-center">
                  <div className="flex items-center gap-1.5"><HandCoins className="w-3 h-3" /> Deudas</div>
                  <span className="text-[8px] opacity-70">{formatCurrency(statsData.deudas)}</span>
                </div>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="divide-y divide-border/50">
          {filteredMovements.length > 0 ? filteredMovements.map((m: any, idx) => {
            const isSale = m.type === 'sale';
            const isDebt = m.type === 'debt';
            const sale = m as Sale;
            const debt = m as SupplierDebt;

            let icon = <ShoppingCart className="w-6 h-6" />;
            let colorClass = "bg-primary/10 text-primary";
            let amountPrefix = "+";

            if (m.filterCategory === 'egresos') {
              icon = <Wallet className="w-6 h-6" />;
              colorClass = "bg-destructive/10 text-destructive";
              amountPrefix = "-";
            } else if (m.filterCategory === 'fiados') {
              icon = <UserPlus className="w-6 h-6" />;
              colorClass = "bg-accent/10 text-accent-foreground";
            } else if (m.filterCategory === 'deudas') {
              icon = <HandCoins className="w-6 h-6" />;
              colorClass = "bg-amber-500/10 text-amber-600";
              amountPrefix = "-";
            } else if (isSale && sale.isAbono) {
              icon = <Coins className="w-6 h-6" />;
              colorClass = "bg-emerald-500/10 text-emerald-600";
            }

            return (
              <div key={idx} className={cn("p-5 flex justify-between items-center hover:bg-muted/10 transition-colors group", m.filterCategory === 'fiados' && "bg-accent/5")}>
                <div className="flex gap-4 items-center">
                  <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm", colorClass)}>
                    {icon}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-sm uppercase tracking-tight">
                        {isSale ? (sale.customerName ? `Venta: ${sale.customerName}` : `Venta #${sale.id.slice(-4).toUpperCase()}`) : (m as any).name}
                      </p>
                      {m.filterCategory === 'fiados' && <Badge variant="outline" className="text-[8px] font-black border-accent/30 text-accent-foreground uppercase">Fiado</Badge>}
                      {isDebt && <Badge variant="outline" className="text-[8px] font-black border-amber-500/30 text-amber-600 uppercase">Proveedor</Badge>}
                    </div>
                    <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">{format(m.timestamp, 'dd MMM • HH:mm', { locale: es })}</p>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className={cn("font-black text-xl tracking-tighter", 
                      m.filterCategory === 'fiados' ? "text-accent-foreground" : 
                      (m.filterCategory === 'egresos' || m.filterCategory === 'deudas' ? "text-destructive" : "text-primary")
                    )}>
                      {amountPrefix}{formatCurrency(m.total)}
                    </p>
                    <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">
                      {isSale ? sale.paymentMethod : (m as any).category || 'Registro Cloud'}
                    </p>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {isSale && (
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => downloadTicketTxt(sale)} 
                        className="text-primary hover:bg-primary/10 rounded-xl"
                        title="Descargar Ticket"
                      >
                        <Printer className="w-4 h-4" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(m)} className="text-destructive hover:bg-destructive/10 rounded-xl">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          }) : (
            <div className="py-24 text-center opacity-30 flex flex-col items-center">
              <CalendarIcon className="w-16 h-16 mb-4" />
              <p className="text-xl font-black uppercase tracking-widest">Sin movimientos en esta categoría</p>
            </div>
          )}
        </div>
      </Card>

      {/* MODAL AUDITORIA IA + MODO RESPALDO */}
      <Dialog open={isAuditModalOpen} onOpenChange={setIsAuditModalOpen}>
        <DialogContent className="max-w-4xl rounded-[2.5rem] border-none shadow-2xl p-0 overflow-hidden">
          <div className={cn("p-8 text-white text-center", auditResult?.status === 'CORRECTO' ? "bg-emerald-500" : "bg-amber-500")}>
            <div className="flex justify-center mb-4">{auditResult?.status === 'CORRECTO' ? <CheckCircle2 className="w-16 h-16" /> : <AlertTriangle className="w-16 h-16" />}</div>
            <DialogTitle className="text-3xl font-black tracking-tight">Informe de Integridad Cloud</DialogTitle>
            <p className="text-white/80 font-bold mt-1 uppercase text-xs tracking-widest">
              {auditResult?.usingAi === false ? 'MODO RESPALDO ACTIVO (SIN IA)' : 'Protocolo de Recuento Maestro'}
            </p>
          </div>
          
          <div className="p-8 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-muted/30 p-4 rounded-2xl border border-border/50 text-center">
                <p className="text-[10px] font-black text-muted-foreground uppercase mb-1">Ventas Reales</p>
                <p className="text-lg font-black text-primary">{formatCurrency(auditResult?.totalSalesAudited || 0)}</p>
                <p className="text-[9px] font-bold opacity-60">{auditResult?.salesCount} tickets</p>
              </div>
              <div className="bg-muted/30 p-4 rounded-2xl border border-border/50 text-center">
                <p className="text-[10px] font-black text-muted-foreground uppercase mb-1">Egresos Totales</p>
                <p className="text-lg font-black text-destructive">-{formatCurrency((auditResult?.totalExpensesAudited || 0) + (auditResult?.totalPurchasesAudited || 0))}</p>
                <p className="text-[9px] font-bold opacity-60">{auditResult?.expensesCount + auditResult?.purchasesCount} mov.</p>
              </div>
              <div className="bg-muted/30 p-4 rounded-2xl border border-border/50 text-center ring-2 ring-emerald-500/20">
                <p className="text-[10px] font-black text-muted-foreground uppercase mb-1">Balance Real DB</p>
                <p className={cn("text-lg font-black", auditResult?.netBalanceAudited >= 0 ? "text-emerald-600" : "text-destructive")}>
                  {formatCurrency(auditResult?.netBalanceAudited || 0)}
                </p>
                <Badge variant={auditResult?.status === 'CORRECTO' ? "secondary" : "destructive"} className="text-[8px] h-4 mt-1">Auditado</Badge>
              </div>
              <div className="bg-primary/5 p-4 rounded-2xl border border-primary/20 text-center">
                <p className="text-[10px] font-black text-primary uppercase mb-1">Recuento Manual</p>
                <p className="text-lg font-black text-primary">{formatCurrency(USER_MANUAL_COUNT)}</p>
                <p className="text-[9px] font-bold text-muted-foreground">Cifra Usuario</p>
              </div>
            </div>

            {auditResult?.status !== 'CORRECTO' && (
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <RefreshCw className="w-5 h-5 text-amber-600 animate-spin-slow" />
                  <div>
                    <p className="text-xs font-black uppercase text-amber-700">Fuga Detectada</p>
                    <p className="text-[10px] font-bold text-amber-600 leading-tight">Diferencia de {formatCurrency(Math.abs(auditResult?.difference))}.</p>
                  </div>
                </div>
                <Button 
                  size="sm" 
                  className="rounded-lg h-8 text-[9px] font-black uppercase bg-amber-500 hover:bg-amber-600" 
                  onClick={handleMasterSyncAction}
                >
                  Sincronización Maestra <ArrowRight className="w-3 h-3 ml-1" />
                </Button>
              </div>
            )}

            <div className="p-5 rounded-2xl bg-primary/5 border border-primary/10">
              <h4 className="text-xs font-black text-primary uppercase mb-2 flex items-center gap-2">
                {auditResult?.usingAi === false ? <ShieldCheck className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />} 
                {auditResult?.usingAi === false ? 'Informe de Respaldo' : 'Veredicto Auditor IA'}
              </h4>
              <p className="text-sm font-bold leading-relaxed italic">"{auditResult?.auditMessage}"</p>
            </div>

            {auditResult?.duplicatesDetected?.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-xs font-black text-destructive uppercase flex items-center gap-2"><CopyX className="w-4 h-4" /> Duplicados Cloud ({auditResult.duplicatesDetected.length})</h4>
                <ScrollArea className="h-32 w-full rounded-xl border border-destructive/20">
                  <div className="p-4 space-y-2">
                    {auditResult.duplicatesDetected.map((dup: any, i: number) => (
                      <div key={i} className="flex justify-between items-center text-[11px] p-2 bg-destructive/5 rounded-lg border border-destructive/10">
                        <span className="font-bold">{dup.type}: {dup.customer} - {format(dup.timestamp, 'HH:mm')}</span>
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
    </div>
  );
}
