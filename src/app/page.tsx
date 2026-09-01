
"use client";

import { AppLayout } from '@/components/layout/AppLayout';
import { ClientOnly } from '@/components/ClientOnly';
import { cn, formatCurrency } from '@/lib/utils';
import { 
  AlertCircle, 
  ShoppingBag, 
  Sparkles,
  RefreshCw,
  Clock,
  Info,
  Banknote,
  Smartphone,
  CreditCard,
  Loader2,
  Coins
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { useState, useMemo } from 'react';
import { aiBusinessInsights, AIBusinessInsightsOutput } from '@/ai/flows/ai-business-insights-flow';
import { useCollection, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import { collection, query, where, limit } from 'firebase/firestore';
import { Product, Sale, Purchase, Expense } from '@/lib/types';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useMarketStore } from '@/lib/store';
import { useToast } from '@/hooks/use-toast';
import { startOfMonth, subMonths, endOfMonth } from 'date-fns';

export default function Dashboard() {
  return (
    <ClientOnly>
      <AppLayout>
        <DashboardContent />
      </AppLayout>
    </ClientOnly>
  );
}

function DashboardContent() {
  const db = useFirestore();
  const { user } = useUser();
  const { syncShiftTotals } = useMarketStore();
  const { toast } = useToast();
  
  const productsQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(collection(db, 'productos'), where('userId', '==', user.uid));
  }, [db, user?.uid]);

  const salesQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(collection(db, 'sales'), where('userId', '==', user.uid));
  }, [db, user?.uid]);

  const purchasesQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(collection(db, 'purchases'), where('userId', '==', user.uid));
  }, [db, user?.uid]);

  const expensesQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(collection(db, 'expenses'), where('userId', '==', user.uid));
  }, [db, user?.uid]);
  
  const activeShiftQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(
      collection(db, 'shifts'), 
      where('userId', '==', user.uid), 
      where('isClosed', '==', false),
      limit(1)
    );
  }, [db, user?.uid]);

  const { data: productsRaw } = useCollection<Product>(productsQuery);
  const { data: salesRaw } = useCollection<Sale>(salesQuery);
  const { data: purchasesRaw } = useCollection<Purchase>(purchasesQuery);
  const { data: expensesRaw } = useCollection<Expense>(expensesQuery);
  const { data: activeShifts } = useCollection<any>(activeShiftQuery);

  const products = productsRaw || [];
  const sales = salesRaw || [];
  const purchases = purchasesRaw || [];
  const expenses = expensesRaw || [];
  const activeShift = activeShifts?.[0];

  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<AIBusinessInsightsOutput | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const currentShiftSales = useMemo(() => {
    return activeShift ? sales.filter(s => s.sessionId === activeShift.id) : [];
  }, [sales, activeShift?.id]);

  const currentShiftExpenses = useMemo(() => {
    return activeShift ? expenses.filter(e => e.sessionId === activeShift.id) : [];
  }, [expenses, activeShift?.id]);

  const currentShiftPurchases = useMemo(() => {
    return activeShift ? purchases.filter(p => p.sessionId === activeShift.id) : [];
  }, [purchases, activeShift?.id]);

  const totals = useMemo(() => {
    const initialBalance = Number(activeShift?.initialBalance) || 0;
    const result = { collectedTotal: initialBalance, pendingFiado: 0, Efectivo: initialBalance, Transferencia: 0, Tarjeta: 0, Fiado: 0 };

    currentShiftSales.forEach(s => {
      const method = s.paymentMethod || 'Efectivo';
      const amount = Number(s.total) || 0;
      if (method !== 'Fiado') {
        result.collectedTotal += amount;
        result[method] = (result[method] || 0) + amount;
      } else {
        result.pendingFiado += amount;
        result.Fiado += amount;
      }
    });

    // Solo restamos compras que fueron pagadas (no deudas)
    const totalOut = currentShiftExpenses.reduce((acc, e) => acc + (Number(e.amount) || 0), 0) + 
                     currentShiftPurchases.filter(p => p.paymentType === 'paid').reduce((acc, p) => acc + (Number(p.total) || 0), 0);

    result.collectedTotal -= totalOut;
    result.Efectivo -= totalOut;
    return result;
  }, [currentShiftSales, currentShiftExpenses, currentShiftPurchases, activeShift]);
  
  const lowStockItems = products.filter(p => p.stock <= p.minStock);
  const totalInventoryValue = products.reduce((acc, p) => acc + (p.stock * p.precioVenta), 0);

  const handleSyncTotals = async () => {
    if (!activeShift) return;
    setIsSyncing(true);
    try {
      await syncShiftTotals(activeShift.id);
      toast({ title: "Dashboard Sincronizado", description: "El total diario se ha corregido con la suma real de ventas." });
    } catch (e) {
      toast({ title: "Error de Sincronización", variant: "destructive" });
    } finally {
      setIsSyncing(false);
    }
  };

  const fetchAIInsights = async () => {
    if (sales.length === 0 && products.length === 0) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const now = new Date();
      const thisMonthStart = startOfMonth(now).getTime();
      const lastMonthStart = startOfMonth(subMonths(now, 1)).getTime();
      const lastMonthEnd = endOfMonth(subMonths(now, 1)).getTime();

      const currentMonthRevenue = sales
        .filter(s => s.timestamp >= thisMonthStart && s.paymentMethod !== 'Fiado')
        .reduce((a, s) => a + (Number(s.total) || 0), 0);
      
      const currentMonthExpenses = expenses
        .filter(e => e.timestamp >= thisMonthStart)
        .reduce((a, e) => a + (Number(e.amount) || 0), 0) + 
        purchases.filter(p => p.timestamp >= thisMonthStart && p.paymentType === 'paid').reduce((a, p) => a + (Number(p.total) || 0), 0);

      const lastMonthRevenue = sales
        .filter(s => s.timestamp >= lastMonthStart && s.timestamp <= lastMonthEnd && s.paymentMethod !== 'Fiado')
        .reduce((a, s) => a + (Number(s.total) || 0), 0);
      
      const lastMonthExpenses = expenses
        .filter(e => e.timestamp >= lastMonthStart && e.timestamp <= lastMonthEnd)
        .reduce((a, e) => a + (Number(e.amount) || 0), 0) +
        purchases.filter(p => p.timestamp >= lastMonthStart && p.timestamp <= lastMonthEnd && p.paymentType === 'paid').reduce((a, p) => a + (Number(p.total) || 0), 0);

      const result = await aiBusinessInsights({
        currentMonth: {
          name: 'Mes Actual',
          revenue: currentMonthRevenue,
          expenses: currentMonthExpenses,
          netProfit: currentMonthRevenue - currentMonthExpenses
        },
        lastMonth: {
          name: 'Mes Anterior',
          revenue: lastMonthRevenue,
          expenses: lastMonthExpenses
        },
        lowStockProducts: lowStockItems.slice(0, 5).map(p => p.name)
      });
      setAiResult(result);
    } catch (error: any) {
      setAiError('Límite de IA temporal. Reintenta en unos segundos.');
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-black text-foreground tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1 text-lg">
            {activeShift ? `Turno activo: ${activeShift.cashierName}` : 'No hay turnos activos.'}
          </p>
        </div>
        <Button onClick={fetchAIInsights} disabled={aiLoading} className="rounded-xl h-12 px-6 gap-2 font-black shadow-lg">
          {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} AI Insights
        </Button>
      </div>

      {aiError && (
        <Alert variant="destructive" className="rounded-2xl border-none bg-destructive/10">
          <AlertTitle className="font-black text-xs uppercase tracking-widest">IA en Pausa</AlertTitle>
          <AlertDescription className="text-xs font-bold">{aiError}</AlertDescription>
        </Alert>
      )}

      {aiResult && (
        <Card className={cn(
          "rounded-3xl border-none shadow-2xl overflow-hidden transition-all animate-in zoom-in-95 duration-500",
          aiResult.status === 'SALUDABLE' ? "bg-emerald-500/5 ring-1 ring-emerald-500/20" : "bg-destructive/5 ring-1 ring-destructive/20"
        )}>
          <CardHeader className="bg-muted/10">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2 text-primary">
                <Sparkles className="w-5 h-5" />
                <span className="text-[10px] font-black uppercase tracking-widest">Consultor Financiero MarketFlow</span>
              </div>
              {aiResult.status && <Badge variant="secondary" className="font-black text-[9px] uppercase">{aiResult.status}</Badge>}
            </div>
          </CardHeader>
          <CardContent className="p-8 space-y-6">
            <div className="space-y-2">
              <h2 className="text-2xl font-black tracking-tight">{aiResult.status === 'CRITICO' ? '⚠️ MARGEN EN RIESGO' : 'Resumen Estratégico'}</h2>
              <p className="text-muted-foreground leading-relaxed">{aiResult.summary}</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {aiResult.insights.map((ins, i) => (
                <div key={i} className="bg-background p-4 rounded-2xl border border-border/50 shadow-sm">
                  <p className="text-xs font-bold leading-relaxed">{ins}</p>
                </div>
              ))}
            </div>
            <div className="p-5 bg-primary/10 rounded-2xl flex items-center gap-4">
              <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center shrink-0"><Info className="w-5 h-5 text-white" /></div>
              <p className="text-sm font-black italic text-primary">"{aiResult.motivationalAdvice}"</p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="rounded-2xl border-none bg-primary text-primary-foreground shadow-2xl shadow-primary/20 overflow-hidden relative">
          <div className="absolute -top-6 -right-6 opacity-10 pointer-events-none"><Coins className="w-32 h-32 rotate-12" /></div>
          <div className="absolute top-3 right-3 z-10 flex gap-2">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={handleSyncTotals}
              disabled={isSyncing || !activeShift}
              className="text-white/80 hover:text-white bg-white/10 p-2 rounded-full hover:bg-white/20 shadow-sm h-9 w-9"
            >
              <RefreshCw className={cn("w-4 h-4", isSyncing && "animate-spin")} />
            </Button>
          </div>
          <CardHeader className="pb-2">
            <CardDescription className="text-primary-foreground/70 font-medium uppercase text-[10px] tracking-widest">Efectivo en Caja (Real)</CardDescription>
            <CardTitle className="text-4xl font-black tracking-tight">{formatCurrency(totals.collectedTotal)}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mt-4 space-y-1">
              <div className="flex justify-between items-center text-[10px] bg-white/10 p-1.5 rounded-lg">
                <span className="flex items-center gap-1.5"><Banknote className="w-3 h-3" /> Efectivo</span>
                <span className="font-bold">{formatCurrency(totals.Efectivo)}</span>
              </div>
              <div className="flex justify-between items-center text-[10px] bg-white/10 p-1.5 rounded-lg">
                <span className="flex items-center gap-1.5"><Smartphone className="w-3 h-3" /> Transf.</span>
                <span className="font-bold">{formatCurrency(totals.Transferencia)}</span>
              </div>
              <div className="flex justify-between items-center text-[10px] bg-white/10 p-1.5 rounded-lg">
                <span className="flex items-center gap-1.5"><CreditCard className="w-3 h-3" /> Tarjeta</span>
                <span className="font-bold">{formatCurrency(totals.Tarjeta)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-none bg-card shadow-xl overflow-hidden">
          <CardHeader className="pb-2">
            <CardDescription className="text-muted-foreground font-medium uppercase text-[10px] tracking-widest">Valor Inventario</CardDescription>
            <CardTitle className="text-4xl font-black tracking-tight text-foreground">{formatCurrency(totalInventoryValue)}</CardTitle>
          </CardHeader>
          <CardContent>
             <div className="space-y-3 mt-4">
               <Progress value={products.length > 0 ? ((products.length - lowStockItems.length) / products.length) * 100 : 100} className="h-2 bg-muted" />
               <p className="text-[10px] text-muted-foreground font-medium">{products.length} productos registrados</p>
             </div>
          </CardContent>
        </Card>

        <Card className={cn("rounded-2xl border-none bg-card shadow-xl overflow-hidden", lowStockItems.length > 0 ? "ring-2 ring-destructive/20" : "")}>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <div>
              <CardDescription className="text-muted-foreground font-medium uppercase text-[10px] tracking-widest">Faltantes Críticos</CardDescription>
              <CardTitle className="text-4xl font-black tracking-tight text-foreground">{lowStockItems.length}</CardTitle>
            </div>
            {lowStockItems.length > 0 && <AlertCircle className="text-destructive w-8 h-8 animate-pulse" />}
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mt-4 leading-relaxed">
              {lowStockItems.length > 0 ? `Requieren reposición inmediata.` : "Todos los niveles están saludables."}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
