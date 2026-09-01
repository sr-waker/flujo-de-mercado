
"use client";

import { useMemo, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { ClientOnly } from '@/components/ClientOnly';
import { cn, formatCurrency } from '@/lib/utils';
import { 
  Wallet,
  Plus,
  Info,
  TrendingUp,
  Loader2,
  Calendar,
  ChevronRight,
  Receipt,
  ShoppingCart,
  History,
  FileText,
  Scale,
  Package,
  Coins,
  Trash2,
  ArrowUpCircle,
  PackagePlus,
  Banknote,
  Zap,
  CalendarDays
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { format, subMonths, startOfMonth, endOfMonth, startOfWeek, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { useCollection, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import { collection, query, where, limit } from 'firebase/firestore';
import { Sale, Expense, Purchase, PaymentMethod } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useMarketStore } from '@/lib/store';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover";
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const EXPENSE_CATEGORIES = ['Servicios', 'Sueldos', 'Alquiler', 'Combustible', 'Mantenimiento', 'Otros'];

export default function ReportsPage() {
  return (
    <ClientOnly>
      <AppLayout>
        <ReportsContent />
      </AppLayout>
    </ClientOnly>
  );
}

function ReportsContent() {
  const db = useFirestore();
  const { user } = useUser();
  const { addExpense, deleteExpense, deletePurchase } = useMarketStore();
  const { toast } = useToast();

  const [monthFilter, setMonthFilter] = useState<'current' | 'previous'>('current');
  const [transactionType, setTransactionFilter] = useState<'all' | 'products' | 'balanza'>('all');
  
  const [expenseForm, setExpenseForm] = useState({ concept: '', amount: '', category: EXPENSE_CATEGORIES[0] });
  const [isSubmittingExpense, setIsSubmittingExpense] = useState(false);

  const currentInterval = useMemo(() => {
    const now = new Date();
    if (monthFilter === 'current') {
      return { start: startOfMonth(now), end: endOfMonth(now) };
    }
    const prev = subMonths(now, 1);
    return { start: startOfMonth(prev), end: endOfMonth(prev) };
  }, [monthFilter]);

  const monthName = useMemo(() => {
    const name = format(currentInterval.start, 'MMMM', { locale: es });
    return name.charAt(0).toUpperCase() + name.slice(1);
  }, [currentInterval]);

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

  const activeShiftQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(
      collection(db, 'shifts'), 
      where('userId', '==', user.uid), 
      where('isClosed', '==', false),
      limit(1)
    );
  }, [db, user?.uid]);
  
  const { data: salesRaw, isLoading: isSalesLoading } = useCollection<Sale>(salesQuery);
  const { data: expensesRaw, isLoading: isExpensesLoading } = useCollection<Expense>(expensesQuery);
  const { data: purchasesRaw, isLoading: isPurchasesLoading } = useCollection<Purchase>(purchasesQuery);
  const { data: activeShifts } = useCollection<any>(activeShiftQuery);
  
  const activeSession = activeShifts?.[0];
  
  const monthExpenses = useMemo(() => {
    return (expensesRaw || []).filter(e => 
      e.timestamp >= currentInterval.start.getTime() && 
      e.timestamp <= currentInterval.end.getTime()
    ).sort((a, b) => b.timestamp - a.timestamp);
  }, [expensesRaw, currentInterval]);

  const monthPurchases = useMemo(() => {
    return (purchasesRaw || []).filter(p => 
      p.timestamp >= currentInterval.start.getTime() && 
      p.timestamp <= currentInterval.end.getTime()
    ).sort((a, b) => b.timestamp - a.timestamp);
  }, [purchasesRaw, currentInterval]);

  const stats = useMemo(() => {
    const totalExpensesAmount = monthExpenses.reduce((acc, e) => acc + (e.amount || 0), 0);
    const totalPurchasesVolume = monthPurchases.reduce((acc, p) => acc + (p.total || 0), 0);
    const totalPaidPurchases = monthPurchases.filter(p => p.paymentType === 'paid').reduce((acc, p) => acc + (p.total || 0), 0);
    
    const filteredSales = (salesRaw || []).filter(s => 
      s.timestamp >= currentInterval.start.getTime() && 
      s.timestamp <= currentInterval.end.getTime()
    );
    const totalRealRevenue = filteredSales.filter(s => s.paymentMethod !== 'Fiado').reduce((acc, s) => acc + (s.total || 0), 0);

    const now = new Date();
    const dayStart = startOfDay(now).getTime();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 }).getTime();

    const dailyRevenue = (salesRaw || [])
      .filter(s => s.timestamp >= dayStart && s.paymentMethod !== 'Fiado')
      .reduce((acc, s) => acc + (s.total || 0), 0);

    const weeklyRevenue = (salesRaw || [])
      .filter(s => s.timestamp >= weekStart && s.paymentMethod !== 'Fiado')
      .reduce((acc, s) => acc + (s.total || 0), 0);

    return {
      totalPurchasesVolume,
      totalPaidPurchases,
      totalExpensesAmount,
      totalRealRevenue,
      dailyRevenue,
      weeklyRevenue,
      netBalance: totalRealRevenue - totalExpensesAmount - totalPaidPurchases
    };
  }, [salesRaw, monthExpenses, monthPurchases, currentInterval]);

  const combinedExpenses = useMemo(() => {
    const p = monthPurchases.map(item => ({ 
      id: item.id, 
      concept: `Compra Mercadería: ${item.supplierName}`, 
      amount: item.total, 
      category: 'Mercadería', 
      timestamp: item.timestamp,
      type: 'purchase' as const
    }));
    const e = monthExpenses.map(item => ({ 
      id: item.id, 
      concept: item.concept, 
      amount: item.amount, 
      category: item.category, 
      timestamp: item.timestamp,
      type: 'expense' as const
    }));
    return [...p, ...e].sort((a, b) => b.timestamp - a.timestamp);
  }, [monthPurchases, monthExpenses]);

  const filteredTransactions = useMemo(() => {
    let list = (salesRaw || []).filter(s => 
      s.timestamp >= currentInterval.start.getTime() && 
      s.timestamp <= currentInterval.end.getTime()
    );

    if (transactionType === 'products') {
      list = list.filter(s => (s.items || []).length > 0);
    } else if (transactionType === 'balanza') {
      list = list.filter(s => (s.extraCharges || []).some(ec => ec.isBalanza));
    }

    return list.sort((a, b) => b.timestamp - a.timestamp);
  }, [salesRaw, currentInterval, transactionType]);

  const handleCreateExpense = async () => {
    if (!expenseForm.amount) return;
    setIsSubmittingExpense(true);
    try {
      addExpense(activeSession?.id || null, {
        concept: expenseForm.concept || 'Gasto General',
        amount: parseFloat(expenseForm.amount),
        category: expenseForm.category,
        paymentMethod: 'Efectivo'
      });
      toast({ title: "Gasto Registrado", description: expenseForm.concept || "Se ha cargado el movimiento." });
      setExpenseForm({ concept: '', amount: '', category: EXPENSE_CATEGORIES[0] });
    } catch (e) {
      toast({ title: "Error", variant: "destructive" });
    } finally {
      setIsSubmittingExpense(false);
    }
  };

  const handleDeleteExpense = (id: string, type: 'expense' | 'purchase') => {
    if (!id) return;
    if (!confirm("¿Seguro que deseas eliminar este registro contable? Esta acción no se puede deshacer.")) return;
    
    if (type === 'expense') {
      deleteExpense(id);
    } else {
      deletePurchase(id);
    }
    toast({ title: "Registro eliminado", description: "El balance se ha actualizado." });
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-4xl font-black text-foreground tracking-tight">Resumen Financiero</h1>
          <p className="text-muted-foreground mt-1 text-lg flex items-center gap-2">
            ¡Monitorea la salud de tu negocio comparando ingresos reales contra egresos!
          </p>
        </div>
        <div className="bg-muted p-1 rounded-xl flex gap-1 shadow-sm">
          <Button 
            variant={monthFilter === 'current' ? 'default' : 'ghost'} 
            size="sm" 
            onClick={() => setMonthFilter('current')}
            className="rounded-lg font-bold"
          >
            Este Mes
          </Button>
          <Button 
            variant={monthFilter === 'previous' ? 'default' : 'ghost'} 
            size="sm" 
            onClick={() => setMonthFilter('previous')}
            className="rounded-lg font-bold"
          >
            Mes Pasado
          </Button>
        </div>
      </div>

      {/* METRICAS PRINCIPALES (BALANCE) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="rounded-2xl border-none bg-primary text-primary-foreground shadow-xl">
          <CardHeader className="pb-2">
            <CardDescription className="text-primary-foreground/70 font-bold uppercase tracking-wider text-[10px]">Inversión en Stock</CardDescription>
            <CardTitle className="text-3xl font-black">{formatCurrency(stats.totalPurchasesVolume)}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-[10px] font-bold opacity-60">Volumen de mercadería ›</p>
          </CardContent>
        </Card>
        
        <Card className="rounded-2xl border-none bg-destructive text-destructive-foreground shadow-xl">
          <CardHeader className="pb-2">
            <CardDescription className="text-destructive-foreground/70 font-bold uppercase tracking-wider text-[10px]">Salidas de Caja</CardDescription>
            <CardTitle className="text-3xl font-black">{formatCurrency(stats.totalExpensesAmount + stats.totalPaidPurchases)}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-[10px] font-bold opacity-60">Gastos y pagos reales ›</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-none bg-emerald-500 text-white shadow-xl">
          <CardHeader className="pb-2">
            <div className="flex justify-between items-start">
              <CardDescription className="text-white/70 font-bold uppercase tracking-wider text-[10px]">Balance Neto (Efectivo)</CardDescription>
              <Popover>
                <PopoverTrigger asChild><button className="text-white/50 hover:text-white"><Info className="w-4 h-4" /></button></PopoverTrigger>
                <PopoverContent className="w-80 rounded-2xl shadow-2xl border-none p-6 text-foreground">
                  <div className="space-y-3">
                    <p className="text-sm font-bold">¿Qué es el Balance Neto?</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Es la <strong>recaudación real</strong> (Efectivo, Tarjeta, Transf) menos todos los <strong>egresos de caja</strong> realizados en el período.
                    </p>
                    <p className="text-xs text-primary font-bold italic">¡Es el dinero real que te queda libre!</p>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <CardTitle className="text-3xl font-black">{formatCurrency(stats.netBalance)}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-[10px] font-bold opacity-70">Saldo final en el bolsillo.</p>
          </CardContent>
        </Card>
      </div>

      {/* METRICAS DE VENTAS (DIA / SEMANA / MES) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <Card className="rounded-2xl border-none bg-card shadow-xl border-l-4 border-primary lg:col-span-1">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="w-4 h-4 text-primary" />
              <CardDescription className="font-black uppercase tracking-widest text-[9px]">Ventas del Día</CardDescription>
            </div>
            <CardTitle className="text-2xl font-black text-primary">{formatCurrency(stats.dailyRevenue)}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-[9px] text-muted-foreground font-medium uppercase">Recaudado hoy</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-none bg-card shadow-xl border-l-4 border-indigo-500 lg:col-span-1">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2 mb-1">
              <CalendarDays className="w-4 h-4 text-indigo-500" />
              <CardDescription className="font-black uppercase tracking-widest text-[9px]">Ventas Semanales</CardDescription>
            </div>
            <CardTitle className="text-2xl font-black text-indigo-600">{formatCurrency(stats.weeklyRevenue)}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-[9px] text-muted-foreground font-medium uppercase">Rendimiento 7 días</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-none bg-card shadow-xl border-l-4 border-primary lg:col-span-1">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2 mb-1">
              <ArrowUpCircle className="w-4 h-4 text-primary" />
              <CardDescription className="font-black uppercase tracking-widest text-[9px]">Ventas del Mes</CardDescription>
            </div>
            <CardTitle className="text-2xl font-black text-primary">{formatCurrency(stats.totalRealRevenue)}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-[9px] text-muted-foreground font-medium uppercase">Total período seleccionado</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-none bg-card shadow-xl border-l-4 border-blue-500 lg:col-span-1">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2 mb-1">
              <PackagePlus className="w-4 h-4 text-blue-500" />
              <CardDescription className="font-black uppercase tracking-widest text-[9px]">Mercadería (Mes)</CardDescription>
            </div>
            <CardTitle className="text-2xl font-black text-blue-600">{formatCurrency(stats.totalPaidPurchases)}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-[9px] text-muted-foreground font-medium uppercase">Compras pagadas</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-none bg-card shadow-xl border-l-4 border-amber-500 lg:col-span-1">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2 mb-1">
              <Banknote className="w-4 h-4 text-amber-500" />
              <CardDescription className="font-black uppercase tracking-widest text-[9px]">Gastos (Mes)</CardDescription>
            </div>
            <CardTitle className="text-2xl font-black text-amber-600">{formatCurrency(stats.totalExpensesAmount)}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-[9px] text-muted-foreground font-medium uppercase">Servicios y operativos</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        {/* FORMULARIO DE GASTOS */}
        <Card className="rounded-3xl border-none shadow-2xl bg-card overflow-hidden transition-all border border-border/50 h-full">
          <div className="p-8 space-y-6">
            <div className="flex items-center gap-3 text-primary">
              <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center">
                <FileText className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-2xl font-black tracking-tight leading-tight">Registrar Gasto</h2>
                <p className="text-muted-foreground text-xs font-medium uppercase tracking-widest">Añade costos fijos de {monthName}.</p>
              </div>
            </div>

            <div className="space-y-5 pt-2">
              <div className="space-y-2">
                <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">Concepto</Label>
                <Input 
                  placeholder="Ej: Pago de Luz (Opcional)" 
                  value={expenseForm.concept} 
                  onChange={e => setExpenseForm({...expenseForm, concept: e.target.value})} 
                  className="h-14 rounded-2xl bg-muted/20 border-none shadow-inner text-lg font-bold" 
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">Monto ($)</Label>
                  <Input 
                    type="number" 
                    placeholder="0.00" 
                    value={expenseForm.amount} 
                    onChange={e => setExpenseForm({...expenseForm, amount: e.target.value})} 
                    className="h-14 rounded-2xl bg-muted/20 border-none shadow-inner text-xl font-black" 
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">Categoría</Label>
                  <Select value={expenseForm.category} onValueChange={v => setExpenseForm({...expenseForm, category: v})}>
                    <SelectTrigger className="h-14 rounded-2xl bg-muted/20 border-none shadow-inner font-bold">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl">
                      {EXPENSE_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button 
                onClick={handleCreateExpense} 
                disabled={isSubmittingExpense || !expenseForm.amount} 
                className="w-full h-16 rounded-[1.5rem] bg-primary hover:scale-[1.02] transition-transform text-lg font-black uppercase shadow-xl shadow-primary/20 gap-3"
              >
                {isSubmittingExpense ? <Loader2 className="w-6 h-6 animate-spin" /> : <Plus className="w-6 h-6" />}
                Cargar Gasto
              </Button>
            </div>
          </div>
        </Card>

        {/* LISTADO DE EGRESOS COMBINADOS */}
        <Card className="rounded-3xl border-none shadow-2xl bg-card overflow-hidden border border-border/50 flex flex-col h-full">
          <CardHeader className="bg-muted/10 p-6 text-center shrink-0 border-b">
            <CardTitle className="text-2xl font-black uppercase tracking-tight">Gastos del Mes</CardTitle>
          </CardHeader>
          <CardContent className="p-0 flex-1 overflow-hidden">
            <ScrollArea className="h-[430px] w-full">
              <div className="divide-y divide-border/30">
                {combinedExpenses.length > 0 ? combinedExpenses.map((exp) => (
                  <div key={exp.id} className="p-5 flex justify-between items-center hover:bg-muted/20 transition-colors group">
                    <div className="space-y-1">
                      <p className="font-bold text-sm text-foreground uppercase tracking-tight leading-tight">{exp.concept}</p>
                      <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">{exp.category}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <p className="font-black text-lg text-destructive tracking-tighter">
                        -{formatCurrency(exp.amount)}
                      </p>
                      <Button 
                        type="button"
                        variant="ghost" 
                        size="icon" 
                        onClick={() => handleDeleteExpense(exp.id, exp.type)}
                        className="opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:bg-destructive/10 rounded-xl"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )) : (
                  <div className="py-32 text-center text-muted-foreground opacity-50 flex flex-col items-center gap-3">
                    <History className="w-12 h-12 opacity-20" />
                    <p className="font-bold uppercase tracking-widest text-xs">Sin egresos registrados</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* LISTADO DE TRANSACCIONES */}
      <Card className="rounded-[2.5rem] border-none shadow-2xl bg-card overflow-hidden border border-border/50">
        <div className="p-8 border-b bg-muted/10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <Receipt className="w-6 h-6 text-primary" />
              <h2 className="text-2xl font-black tracking-tight">Transacciones de {monthName}</h2>
            </div>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Los fiados se muestran en naranja.</p>
          </div>

          <Tabs value={transactionType} onValueChange={(v: any) => setTransactionFilter(v)} className="bg-muted p-1 rounded-xl shadow-inner h-auto">
            <TabsList className="bg-transparent border-none p-0 h-auto gap-1">
              <TabsTrigger value="all" className="rounded-lg px-6 font-bold uppercase text-[10px] tracking-widest py-2">TODOS</TabsTrigger>
              <TabsTrigger value="products" className="rounded-lg px-6 font-bold uppercase text-[10px] tracking-widest py-2">PRODUCTOS</TabsTrigger>
              <TabsTrigger value="balanza" className="rounded-lg px-6 font-bold uppercase text-[10px] tracking-widest py-2">BALANZA</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="overflow-x-auto">
          <ScrollArea className="h-[500px] w-full">
            {isSalesLoading ? (
              <div className="h-60 flex items-center justify-center">
                <Loader2 className="w-10 h-10 animate-spin text-primary" />
              </div>
            ) : filteredTransactions.length > 0 ? (
              <div className="divide-y divide-border/30">
                {filteredTransactions.map((sale) => {
                  const isFiado = sale.paymentMethod === 'Fiado';
                  const isBalanza = (sale.extraCharges || []).some(ec => ec.isBalanza);
                  const isAbono = sale.isAbono;

                  return (
                    <div key={sale.id} className={cn(
                      "p-6 flex justify-between items-center transition-colors group",
                      isFiado ? "bg-amber-500/5 hover:bg-amber-500/10" : "hover:bg-muted/20"
                    )}>
                      <div className="flex gap-5 items-center">
                        <div className={cn(
                          "w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm",
                          isFiado ? "bg-amber-500/10 text-amber-600" : (isAbono ? "bg-emerald-500/10 text-emerald-600" : "bg-primary/10 text-primary")
                        )}>
                          {isBalanza ? <Scale className="w-6 h-6" /> : (isAbono ? <Coins className="w-6 h-6" /> : <ShoppingCart className="w-6 h-6" />)}
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <p className="font-black text-sm uppercase tracking-tight">
                              {isAbono ? `Abono: ${sale.customerName || 'Cliente'}` : (sale.customerName ? `Venta: ${sale.customerName}` : `Ticket #${sale.id.slice(-4).toUpperCase()}`)}
                            </p>
                            {isFiado && <Badge className="bg-amber-500 text-white border-none font-black text-[8px] uppercase px-1.5 h-4">Fiado</Badge>}
                            {isBalanza && <Badge variant="outline" className="text-primary border-primary/20 font-black text-[8px] uppercase px-1.5 h-4">Balanza</Badge>}
                          </div>
                          <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest flex items-center gap-2">
                            <Calendar className="w-3 h-3" /> {format(sale.timestamp, 'dd MMM • HH:mm', { locale: es })}
                            <span className="opacity-30">•</span>
                            {sale.paymentMethod}
                          </p>
                        </div>
                      </div>
                      <div className="text-right space-y-1">
                        <p className={cn(
                          "font-black text-2xl tracking-tighter",
                          isFiado ? "text-amber-600" : (isAbono ? "text-emerald-500" : "text-primary")
                        )}>
                          {formatCurrency(sale.total)}
                        </p>
                        <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">
                          {sale.items?.length || 0} Ítems registrados
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-40 text-center opacity-30 flex flex-col items-center gap-4">
                <History className="w-20 h-20" />
                <p className="text-xl font-black uppercase tracking-widest">Sin transacciones en esta categoría</p>
              </div>
            )}
          </ScrollArea>
        </div>
      </Card>
    </div>
  );
}
