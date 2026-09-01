
"use client";

import { useState, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { ClientOnly } from '@/components/ClientOnly';
import { useMarketStore } from '@/lib/store';
import { 
  Plus, 
  Search, 
  HandCoins, 
  Coins, 
  ChevronRight, 
  Printer, 
  Wallet,
  CheckCircle2,
  Clock,
  ArrowDownCircle,
  FileText,
  ShoppingCart,
  Receipt,
  Trash2,
  PackagePlus,
  Loader2,
  TrendingDown,
  Sparkles,
  Zap,
  RefreshCw,
  AlertTriangle,
  ShieldCheck,
  PlusCircle,
  Edit2
} from 'lucide-react';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { Purchase, Expense, SupplierDebt, PaymentMethod, Product, Category } from '@/lib/types';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useCollection, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import { collection, query, where, limit } from 'firebase/firestore';
import { cn, formatCurrency } from '@/lib/utils';
import { downloadSupplierPaymentTxt } from '@/lib/ticket-formatter';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const EXPENSE_CATEGORIES = ['Servicios', 'Sueldos', 'Alquiler', 'Combustible', 'Mantenimiento', 'Otros'];

export default function PurchasesPage() {
  return (
    <ClientOnly>
      <AppLayout>
        <PurchasesContent />
      </AppLayout>
    </ClientOnly>
  );
}

function PurchasesContent() {
  const db = useFirestore();
  const { user } = useUser();
  const { 
    registerSupplierCascadingPayment,
    registerSupplierFullPayment,
    deleteSupplierDebt,
    addPurchase,
    addExpense,
    addSupplierDebt,
    triggerMasterPurchaseCleanup,
    syncShiftTotals,
    deleteSupplierFolder,
    renameSupplier,
    updateSupplierDebt
  } = useMarketStore();
  const { toast } = useToast();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFolder, setSelectedFolder] = useState<any>(null);
  const [isCascadingModalOpen, setIsCascadingModalOpen] = useState(false);
  const [targetSupplier, setTargetSupplier] = useState<any>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Efectivo');

  // Auditoría Compras
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditResult, setAuditResult] = useState<{ count: number } | null>(null);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);

  // Modales de Acción
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [isNewDebtModalOpen, setIsNewDebtModalOpen] = useState(false);
  
  // Modales de Edición Carpeta
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');

  // Form States
  const [purchaseForm, setPurchaseForm] = useState({ supplier: '', productId: '', qty: '', cost: '', isDebt: false });
  const [expenseForm, setExpenseForm] = useState({ concept: '', amount: '', category: EXPENSE_CATEGORIES[0] });
  const [debtForm, setDebtForm] = useState({ supplier: '', amount: '', notes: '' });

  const purchasesQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(collection(db, 'purchases'), where('userId', '==', user.uid));
  }, [db, user?.uid]);

  const expensesQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(collection(db, 'expenses'), where('userId', '==', user.uid));
  }, [db, user?.uid]);

  const debtsQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(collection(db, 'supplier_debts'), where('userId', '==', user.uid));
  }, [db, user?.uid]);

  const productsQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(collection(db, 'productos'), where('userId', '==', user.uid));
  }, [db, user?.uid]);

  const activeShiftQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(collection(db, 'shifts'), where('userId', '==', user.uid), where('isClosed', '==', false), limit(1));
  }, [db, user?.uid]);

  const { data: purchasesRaw } = useCollection<Purchase>(purchasesQuery);
  const { data: expensesRaw } = useCollection<Expense>(expensesQuery);
  const { data: debtsRaw } = useCollection<SupplierDebt>(debtsQuery);
  const { data: products } = useCollection<Product>(productsQuery);
  const { data: activeShifts } = useCollection<any>(activeShiftQuery);
  
  const activeSession = activeShifts?.[0];

  const debtsList = useMemo(() => {
    return [...(debtsRaw || [])].sort((a, b) => b.timestamp - a.timestamp);
  }, [debtsRaw]);

  const unifiedMovementList = useMemo(() => {
    const p = (purchasesRaw || []).map(item => ({ ...item, movementType: 'purchase' as const }));
    const e = (expensesRaw || [])
      .map(item => ({ ...item, movementType: 'expense' as const }));
    return [...p, ...e].sort((a, b) => b.timestamp - a.timestamp);
  }, [purchasesRaw, expensesRaw]);

  const totalEgresosHistorial = useMemo(() => {
    return (expensesRaw || []).reduce((acc, e) => acc + (e.amount || 0), 0) + 
           (purchasesRaw || []).filter(p => p.paymentType === 'paid').reduce((acc, p) => acc + (p.total || 0), 0);
  }, [purchasesRaw, expensesRaw]);

  const supplierFolders = useMemo(() => {
    const folders: Record<string, { total: number; count: number; items: SupplierDebt[] }> = {};
    debtsList.forEach(d => {
      if (!folders[d.supplierName]) folders[d.supplierName] = { total: 0, count: 0, items: [] };
      if (!d.isPaid) {
        folders[d.supplierName].total += (Number(d.amount) || 0);
        folders[d.supplierName].count += 1;
      }
      folders[d.supplierName].items.push(d);
    });
    return Object.entries(folders)
      .map(([name, data]) => ({ name, ...data }))
      .filter(f => f.name.toLowerCase().includes(searchTerm.toLowerCase()))
      .sort((a, b) => b.total - a.total);
  }, [debtsList, searchTerm]);

  const pendingDebtsTotal = useMemo(() => {
    return debtsList.filter(d => !d.isPaid).reduce((acc, d) => acc + (Number(d.amount) || 0), 0);
  }, [debtsList]);

  const handleRunPurchaseAudit = async () => {
    setIsAuditing(true);
    try {
      const result = await triggerMasterPurchaseCleanup();
      setAuditResult(result);
      setIsAuditModalOpen(true);
      if (activeSession) {
        await syncShiftTotals(activeSession.id);
      }
    } catch (e) {
      toast({ title: "Error en Auditoría", variant: "destructive" });
    } finally {
      setIsAuditing(false);
    }
  };

  const handleDeleteFolderAction = async () => {
    if (!selectedFolder) return;
    if (!confirm(`¿Confirmar eliminación total de la carpeta "${selectedFolder.name}"? Se borrarán todos los registros asociados.`)) return;
    
    try {
      await deleteSupplierFolder(selectedFolder.name);
      toast({ title: "Carpeta Eliminada", description: `Se han purgado todos los registros de ${selectedFolder.name}` });
      setSelectedFolder(null);
    } catch (e) {
      toast({ title: "Error al eliminar", variant: "destructive" });
    }
  };

  const handleRenameFolderAction = async () => {
    if (!selectedFolder || !newSupplierName.trim()) return;
    try {
      await renameSupplier(selectedFolder.name, newSupplierName.trim());
      toast({ title: "Carpeta Renombrada", description: `El proveedor ahora es ${newSupplierName}` });
      setIsRenameModalOpen(false);
      setSelectedFolder(null);
    } catch (e) {
      toast({ title: "Error al renombrar", variant: "destructive" });
    }
  };

  const handleCreatePurchase = async () => {
    const qtyInput = purchaseForm.qty.trim();
    const qtyNum = qtyInput === '' ? 0 : parseFloat(qtyInput);
    const costNum = parseFloat(purchaseForm.cost);

    if (isNaN(costNum) || costNum <= 0) {
      toast({ 
        title: "Datos Incompletos", 
        description: "Por favor, ingresa un costo válido.", 
        variant: "destructive" 
      });
      return;
    }
    
    const supplierName = purchaseForm.supplier.trim() || 'Proveedor Varios';
    const product = products?.find(p => p.id === purchaseForm.productId);
    
    const total = qtyNum === 0 ? costNum : qtyNum * costNum;
    
    const purchaseData = {
      supplierName,
      total,
      paymentType: purchaseForm.isDebt ? 'debt' : 'paid',
      items: product ? [{
        productId: product.id,
        name: product.name,
        quantity: qtyNum,
        cost: costNum
      }] : []
    };

    addPurchase(activeSession?.id || null, purchaseData);
    
    if (purchaseForm.isDebt) {
      addSupplierDebt({
        supplierName,
        amount: total,
        notes: product ? `Compra Stock: ${product.name} ${qtyNum > 0 ? `(x${qtyNum})` : '(Sin cant.)'}` : `Compra de Mercadería (Sin detalle)`
      });
    }

    toast({ title: "Compra Registrada", description: product ? `Se cargó stock de ${product.name}` : `Egreso registrado: ${supplierName}` });
    setIsPurchaseModalOpen(false);
    setPurchaseForm({ supplier: '', productId: '', qty: '', cost: '', isDebt: false });
  };

  const handleCreateExpense = () => {
    if (!expenseForm.concept || !expenseForm.amount) return;
    addExpense(activeSession?.id || null, {
      concept: expenseForm.concept,
      amount: parseFloat(expenseForm.amount),
      category: expenseForm.category,
      paymentMethod: 'Efectivo'
    });
    toast({ title: "Gasto Registrado", description: expenseForm.concept });
    setIsExpenseModalOpen(false);
    setExpenseForm({ concept: '', amount: '', category: EXPENSE_CATEGORIES[0] });
  };

  const handleCreateDebt = () => {
    if (!debtForm.supplier || !debtForm.amount) return;
    addSupplierDebt({
      supplierName: debtForm.supplier,
      amount: parseFloat(debtForm.amount),
      notes: debtForm.notes || 'Deuda manual cargada al sistema'
    });
    toast({ title: "Deuda Registrada", description: `Pendiente con ${debtForm.supplier}` });
    setIsNewDebtModalOpen(false);
    setDebtForm({ supplier: '', amount: '', notes: '' });
  };

  const handleFullPayment = async (folder: any) => {
    if (!confirm(`¿Confirmar liquidación total de ${folder.name}?`)) return;
    const pendingItems = folder.items.filter((d: any) => !d.isPaid);
    await registerSupplierFullPayment(activeSession?.id || null, pendingItems, paymentMethod, folder.name);
    toast({ title: "Cuenta Liquidada", description: `Se ha saldado el total de ${folder.name}` });
    setIsCascadingModalOpen(false);
  };

  const handleCascadingPayment = async () => {
    if (!paymentAmount || !targetSupplier) return;
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) return;

    const pendingItems = targetSupplier.items.filter((d: any) => !d.isPaid);
    await registerSupplierCascadingPayment(activeSession?.id || null, pendingItems, amount, paymentMethod, targetSupplier.name);
    
    toast({ title: "Pago Registrado", description: `Abono de ${formatCurrency(amount)} a ${targetSupplier.name}` });
    setIsCascadingModalOpen(false);
    setPaymentAmount('');
  };

  const handleUpdateDebtNotes = (debtId: string) => {
    const newNote = prompt("Ingresa la nueva nota:");
    if (newNote !== null) {
      updateSupplierDebt(debtId, { notes: newNote });
      toast({ title: "Registro Actualizado" });
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6">
        <div>
          <h1 className="text-4xl font-black text-foreground tracking-tight">Cuentas Corrientes</h1>
          <p className="text-muted-foreground mt-1 text-lg">Gestión de deudas y egresos de proveedores.</p>
        </div>
        
        <div className="flex flex-wrap gap-3">
          <Button 
            onClick={handleRunPurchaseAudit} 
            disabled={isAuditing}
            variant="outline"
            className="h-14 px-6 rounded-2xl font-black gap-2 border-primary/30 text-primary hover:bg-primary/5 shadow-sm"
          >
            {isAuditing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />} Auditor Cloud
          </Button>
          <Button onClick={() => setIsPurchaseModalOpen(true)} className="h-14 px-6 rounded-2xl bg-primary font-bold gap-2 shadow-xl shadow-primary/20">
            <ShoppingCart className="w-5 h-5" /> Comprar Stock
          </Button>
          <Button onClick={() => setIsExpenseModalOpen(true)} variant="outline" className="h-14 px-6 rounded-2xl border-2 font-bold gap-2">
            <Receipt className="w-5 h-5" /> Gasto Directo
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="rounded-2xl border-none bg-amber-500 text-white shadow-xl relative overflow-hidden">
          <div className="absolute -right-4 -bottom-4 opacity-10 rotate-12"><HandCoins className="w-32 h-32" /></div>
          <CardHeader className="pb-2">
            <CardDescription className="text-white/70 font-black uppercase text-[10px] tracking-widest">Saldo Adeudado Total</CardDescription>
            <CardTitle className="text-4xl font-black">{formatCurrency(pendingDebtsTotal)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="bg-card rounded-[2rem] shadow-xl overflow-hidden border-none">
        <div className="p-8 border-b bg-muted/10">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground w-5 h-5" />
            <Input 
              placeholder="Buscar por nombre de proveedor..." 
              className="pl-12 h-14 rounded-2xl bg-background border-none shadow-inner text-lg font-medium"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <Tabs defaultValue="debts" className="w-full">
          <TabsList className="bg-transparent p-1 rounded-none border-b flex h-auto">
            <TabsTrigger value="debts" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none font-bold uppercase text-[10px] tracking-widest px-8 py-4">Proveedores</TabsTrigger>
            <TabsTrigger value="purchases" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none font-bold uppercase text-[10px] tracking-widest px-8 py-4">Historial de Egresos</TabsTrigger>
          </TabsList>

          <TabsContent value="debts" className="p-0 mt-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 p-8">
              {supplierFolders.map((folder) => (
                <Card 
                  key={folder.name} 
                  className="rounded-3xl border-none shadow-xl bg-card hover:bg-muted/50 transition-all cursor-pointer group p-6 space-y-4"
                  onClick={() => setSelectedFolder(folder)}
                >
                  <div className="flex justify-between items-start">
                    <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-600">
                      <HandCoins className="w-6 h-6" />
                    </div>
                    {folder.total > 0 && (
                      <Badge variant="destructive" className="bg-amber-600 font-black border-none px-3">
                        {formatCurrency(folder.total)}
                      </Badge>
                    )}
                  </div>
                  <h3 className="text-xl font-black truncate">{folder.name}</h3>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="flex-1 rounded-xl font-bold border-emerald-500 text-emerald-600 hover:bg-emerald-500 hover:text-white"
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        setTargetSupplier(folder); 
                        setIsCascadingModalOpen(true); 
                      }}
                    >
                      <Coins className="w-4 h-4 mr-2" /> Abonar
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="rounded-xl font-bold border-primary text-primary hover:bg-primary hover:text-white"
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        setDebtForm({ ...debtForm, supplier: folder.name });
                        setIsNewDebtModalOpen(true);
                      }}
                    >
                      <PlusCircle className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="rounded-xl"
                      onClick={(e) => { e.stopPropagation(); setSelectedFolder(folder); }}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="purchases" className="p-0 mt-0">
            <div className="p-6 bg-destructive/5 border-b flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center text-destructive">
                  <TrendingDown className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest leading-none mb-1">Total Salidas de Caja</p>
                  <p className="text-2xl font-black text-destructive tracking-tighter">-{formatCurrency(totalEgresosHistorial)}</p>
                </div>
              </div>
              <Badge variant="outline" className="border-destructive/30 text-destructive font-black uppercase text-[10px] h-8 px-4">
                {unifiedMovementList.length} Registros
              </Badge>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow className="border-none">
                    <TableHead className="font-black py-5 pl-8 text-foreground uppercase tracking-widest text-xs">Fecha</TableHead>
                    <TableHead className="font-black text-foreground uppercase tracking-widest text-xs">Concepto / Proveedor</TableHead>
                    <TableHead className="font-black text-foreground uppercase tracking-widest text-xs">Tipo de Movimiento</TableHead>
                    <TableHead className="font-black text-right pr-8 text-foreground uppercase tracking-widest text-xs">Monto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unifiedMovementList.map((m: any, idx) => (
                    <TableRow key={m.id || idx} className="hover:bg-muted/50 transition-colors">
                      <TableCell className="pl-8 text-muted-foreground text-[10px] font-mono">
                        {format(m.timestamp, 'dd/MM/yy HH:mm')}
                      </TableCell>
                      <TableCell>
                        <p className="font-bold text-sm">{m.supplierName || m.concept}</p>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {m.movementType === 'purchase' ? (
                            <Badge variant="secondary" className="bg-blue-500/10 text-blue-500 border-none font-black text-[9px] uppercase tracking-tighter gap-1">
                              <ShoppingCart className="w-3 h-3" /> {m.paymentType === 'paid' ? 'Compra Contado' : 'Compra a Cuenta'}
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className={cn(
                              "border-none font-black text-[9px] uppercase tracking-tighter gap-1",
                              m.concept?.includes("Pago") || m.concept?.includes("Liquidación") ? "bg-amber-500/10 text-amber-500" : "bg-muted text-muted-foreground"
                            )}>
                              {m.concept?.includes("Pago") ? <Coins className="w-3 h-3" /> : <Receipt className="w-3 h-3" />} {m.category || 'Gasto'}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-black text-right pr-8 text-lg text-destructive">
                        -{formatCurrency(m.total || m.amount || 0)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* MODAL AUDITORÍA COMPRAS */}
      <Dialog open={isAuditModalOpen} onOpenChange={setIsAuditModalOpen}>
        <DialogContent className="max-w-md rounded-[2.5rem] border-none shadow-2xl p-0 overflow-hidden">
          <div className={cn("p-8 text-white text-center", auditResult?.count === 0 ? "bg-emerald-500" : "bg-amber-500")}>
            <div className="flex justify-center mb-4">
              {auditResult?.count === 0 ? <ShieldCheck className="w-16 h-16" /> : <Zap className="w-16 h-16" />}
            </div>
            <DialogTitle className="text-3xl font-black tracking-tight">Auditoría de Compras</DialogTitle>
            <p className="text-white/80 font-bold mt-1 uppercase text-xs tracking-widest">Protocolo de Limpieza Atómica</p>
          </div>
          
          <div className="p-8 space-y-6">
            <div className="text-center space-y-4">
              {auditResult?.count === 0 ? (
                <p className="text-sm font-bold text-muted-foreground">No se detectaron compras duplicadas. Tu historial de stock es íntegro.</p>
              ) : (
                <>
                  <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200">
                    <p className="text-lg font-black text-amber-700">Se eliminaron {auditResult?.count} duplicados</p>
                    <p className="text-xs text-amber-600 font-medium mt-1">Los registros fueron detectados por coincidencia temporal y monto.</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-primary/5 border border-primary/10">
                    <p className="text-xs font-bold text-primary uppercase tracking-widest">Sincronización Maestra</p>
                    <p className="text-[11px] text-muted-foreground mt-1">El Balance Neto y las Salidas de Caja se han recalibrado automáticamente.</p>
                  </div>
                </>
              )}
            </div>
          </div>

          <DialogFooter className="p-8 pt-0">
            <Button onClick={() => setIsAuditModalOpen(false)} className="w-full h-14 rounded-2xl font-black uppercase text-lg">Cerrar Informe</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL COMPRAR STOCK */}
      <Dialog open={isPurchaseModalOpen} onOpenChange={setIsPurchaseModalOpen}>
        <DialogContent className="max-w-md rounded-[2rem] border-none shadow-2xl p-0 overflow-hidden">
          <div className="bg-primary p-6 text-white text-center">
            <DialogTitle className="text-2xl font-black">Cargar Stock</DialogTitle>
            <p className="text-white/80 font-bold mt-1 uppercase text-[10px] tracking-widest">Ingreso de Mercadería</p>
          </div>
          <div className="p-8 space-y-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase text-muted-foreground">Proveedor (Opcional)</Label>
              <Input placeholder="Ej: Distribuidora Morrone" value={purchaseForm.supplier} onChange={e => setPurchaseForm({...purchaseForm, supplier: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase text-muted-foreground">Producto (Opcional)</Label>
              <Select value={purchaseForm.productId} onValueChange={v => setPurchaseForm({...purchaseForm, productId: v})}>
                <SelectTrigger className="h-12"><SelectValue placeholder="Seleccionar producto..." /></SelectTrigger>
                <SelectContent>{products?.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-muted-foreground">Cantidad (Opcional)</Label>
                <Input type="number" placeholder="Ej: 10" value={purchaseForm.qty} onChange={e => setPurchaseForm({...purchaseForm, qty: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-muted-foreground">Costo Unitario ($)</Label>
                <Input type="number" placeholder="0.00" value={purchaseForm.cost} onChange={e => setPurchaseForm({...purchaseForm, cost: e.target.value})} />
              </div>
            </div>
            <div className="flex items-center gap-3 pt-4 p-4 rounded-xl bg-muted/30">
              <input type="checkbox" id="isDebt" checked={purchaseForm.isDebt} onChange={e => setPurchaseForm({...purchaseForm, isDebt: e.target.checked})} className="w-5 h-5 accent-primary" />
              <Label htmlFor="isDebt" className="font-bold cursor-pointer">Cargar como Deuda (A Cuenta)</Label>
            </div>
          </div>
          <div className="p-8 pt-0">
            <Button 
              onClick={handleCreatePurchase} 
              disabled={!purchaseForm.cost || parseFloat(purchaseForm.cost) <= 0}
              className="w-full h-14 rounded-2xl text-lg font-black uppercase shadow-xl disabled:opacity-50 disabled:grayscale"
            >
              Confirmar Compra
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* MODAL GASTO DIRECTO */}
      <Dialog open={isExpenseModalOpen} onOpenChange={setIsExpenseModalOpen}>
        <DialogContent className="max-w-md rounded-[2rem] border-none shadow-2xl p-0 overflow-hidden">
          <div className="bg-destructive p-6 text-white text-center">
            <DialogTitle className="text-2xl font-black">Registrar Gasto</DialogTitle>
            <p className="text-white/80 font-bold mt-1 uppercase text-[10px] tracking-widest">Salida de Caja Inmediata</p>
          </div>
          <div className="p-8 space-y-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase text-muted-foreground">Concepto</Label>
              <Input placeholder="Ej: Pago de Luz" value={expenseForm.concept} onChange={e => setExpenseForm({...expenseForm, concept: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase text-muted-foreground">Monto ($)</Label>
              <Input type="number" placeholder="0.00" value={expenseForm.amount} onChange={e => setExpenseForm({...expenseForm, amount: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase text-muted-foreground">Categoría</Label>
              <Select value={expenseForm.category} onValueChange={v => setExpenseForm({...expenseForm, category: v})}>
                <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
                <SelectContent>{EXPENSE_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="p-8 pt-0">
            <Button onClick={handleCreateExpense} variant="destructive" className="w-full h-14 rounded-2xl text-lg font-black uppercase shadow-xl">Guardar Gasto</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* MODAL NUEVA DEUDA (Monto en Carpeta) */}
      <Dialog open={isNewDebtModalOpen} onOpenChange={setIsNewDebtModalOpen}>
        <DialogContent className="max-w-md rounded-[2rem] border-none shadow-2xl p-0 overflow-hidden">
          <div className="bg-amber-600 p-6 text-white text-center">
            <DialogTitle className="text-2xl font-black">Cargar Monto a Pagar</DialogTitle>
            <p className="text-white/80 font-bold mt-1 uppercase text-[10px] tracking-widest">Factura Pendiente con {debtForm.supplier}</p>
          </div>
          <div className="p-8 space-y-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase text-muted-foreground">Proveedor</Label>
              <Input disabled value={debtForm.supplier} className="bg-muted/50 border-none font-bold" />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase text-muted-foreground">Monto de la Factura ($)</Label>
              <Input 
                type="number" 
                placeholder="0.00" 
                value={debtForm.amount} 
                onChange={e => setDebtForm({...debtForm, amount: e.target.value})} 
                className="h-14 rounded-2xl bg-muted/30 border-none text-2xl font-black text-amber-600 text-center"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase text-muted-foreground">Detalle / Notas (Opcional)</Label>
              <Input 
                placeholder="Ej: Factura #9910 - Lácteos" 
                value={debtForm.notes} 
                onChange={e => setDebtForm({...debtForm, notes: e.target.value})} 
              />
            </div>
          </div>
          <div className="p-8 pt-0">
            <Button onClick={handleCreateDebt} className="w-full h-14 rounded-2xl text-lg font-black uppercase shadow-xl bg-amber-600 hover:bg-amber-700">
              Registrar Deuda
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* MODAL DETALLE PROVEEDOR */}
      <Dialog open={!!selectedFolder} onOpenChange={(open) => !open && setSelectedFolder(null)}>
        <DialogContent className="max-w-7xl rounded-[2.5rem] border-none shadow-2xl p-0 overflow-hidden h-[85vh] flex flex-col">
          <div className="py-4 px-8 bg-amber-500 text-white shrink-0 relative overflow-hidden">
            <div className="relative z-10 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <DialogHeader>
                  <DialogTitle className="text-2xl font-black flex items-center gap-2">
                    {selectedFolder?.name || 'Proveedor'}
                    <button onClick={() => { setNewSupplierName(selectedFolder.name); setIsRenameModalOpen(true); }} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors">
                      <Edit2 className="w-4 h-4" />
                    </button>
                  </DialogTitle>
                  <DialogDescription className="text-white/80 font-bold">
                    Saldo Total Adeudado: {formatCurrency(selectedFolder?.total || 0)}
                  </DialogDescription>
                </DialogHeader>
              </div>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  className="bg-white/10 border-white/20 text-white hover:bg-white/20 rounded-xl"
                  onClick={() => handleFullPayment(selectedFolder)}
                  disabled={!selectedFolder?.total}
                >
                  Liquidar Todo
                </Button>
                <Button 
                  variant="outline" 
                  className="bg-white/10 border-white/20 text-white hover:bg-white/20 rounded-xl"
                  onClick={() => { setTargetSupplier(selectedFolder); setIsCascadingModalOpen(true); }}
                >
                  Entregar Pago
                </Button>
              </div>
            </div>
            <div className="absolute -right-5 -bottom-5 opacity-10 pointer-events-none">
              <HandCoins className="w-20 h-20" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 bg-muted/20 border-b py-3 px-6 shrink-0 gap-4">
            <div className="flex flex-col">
              <span className="text-[10px] font-black uppercase text-muted-foreground opacity-60">Facturas Pendientes</span>
              <span className="text-xl font-black">{selectedFolder?.count || 0}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-black uppercase text-muted-foreground opacity-60">Historial Movimientos</span>
              <span className="text-xl font-black">{selectedFolder?.items.length || 0}</span>
            </div>
          </div>

          <ScrollArea className="flex-1 p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {selectedFolder?.items.map((debt: SupplierDebt) => (
                <Card 
                  key={debt.id} 
                  className={cn(
                    "rounded-xl border-none shadow-sm transition-all overflow-hidden",
                    debt.isPaid ? "bg-muted/20 opacity-60" : "bg-white dark:bg-card border-l-4 border-amber-500 shadow-md"
                  )}
                >
                  <Accordion type="single" collapsible className="w-full">
                    <AccordionItem value="payments" className="border-none">
                      <div className="p-3 flex justify-between items-start">
                        <div className="flex-1 min-w-0 pr-4">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-black font-mono text-muted-foreground uppercase bg-muted px-1.5 rounded">
                              REF: {debt.id.slice(-6).toUpperCase()}
                            </span>
                            {debt.isPaid ? (
                              <Badge className="bg-emerald-500/10 text-emerald-500 text-[8px] font-black px-1.5 py-0 h-4 border-none uppercase">Liquidada</Badge>
                            ) : (
                              <Badge className="bg-amber-500/10 text-amber-500 text-[8px] font-black px-1.5 py-0 h-4 border-none uppercase">Pendiente</Badge>
                            )}
                          </div>
                          <p className="font-bold text-sm leading-tight line-clamp-1">{debt.notes || 'Factura de Mercadería'}</p>
                          <p className="text-[9px] text-muted-foreground font-medium mt-0.5">
                            {format(debt.timestamp, 'dd MMM yyyy • HH:mm', { locale: es })}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-[9px] font-black uppercase text-muted-foreground opacity-60 leading-none mb-1">Saldo Actual</p>
                          <p className={cn("text-base font-black tracking-tighter", debt.isPaid ? "text-muted-foreground" : "text-amber-600")}>
                            {formatCurrency(debt.amount)}
                          </p>
                          {debt.initialAmount && debt.initialAmount > debt.amount && (
                            <p className="text-[8px] text-muted-foreground line-through decoration-muted-foreground/30">
                              Original: {formatCurrency(debt.initialAmount)}
                            </p>
                          )}
                        </div>
                      </div>

                      <AccordionTrigger className="px-3 py-1 hover:no-underline text-[9px] font-bold text-muted-foreground uppercase bg-muted/10">
                        Opciones de Factura
                      </AccordionTrigger>
                      <AccordionContent className="p-0 bg-muted/5">
                        <div className="p-3 space-y-2">
                          {debt.payments && debt.payments.length > 0 ? (
                            debt.payments.map((p, idx) => (
                              <div key={idx} className="flex justify-between items-center text-[9px] bg-background p-2 rounded-lg border border-border/40">
                                <div className="flex items-center gap-2">
                                  <Clock className="w-3 h-3 text-muted-foreground" />
                                  <span className="font-medium">{format(p.timestamp, 'dd/MM HH:mm')}</span>
                                  <Badge variant="outline" className="text-[7px] px-1 h-3">{p.method}</Badge>
                                </div>
                                <span className="font-black text-emerald-600">-{formatCurrency(p.amount)}</span>
                              </div>
                            ))
                          ) : (
                            <p className="text-[8px] text-center py-2 text-muted-foreground italic">Sin pagos previos.</p>
                          )}
                          <div className="pt-2 flex gap-2">
                            <Button variant="outline" size="sm" className="h-7 text-[8px] font-black uppercase flex-1 rounded-lg" onClick={() => handleUpdateDebtNotes(debt.id)}>
                              <Edit2 className="w-3 h-3 mr-1" /> Editar Nota
                            </Button>
                            <Button variant="outline" size="sm" className="h-7 text-[8px] font-black uppercase flex-1 rounded-lg" onClick={() => downloadSupplierPaymentTxt(debt)}>
                              <Printer className="w-3 h-3 mr-1" /> Ticket
                            </Button>
                            {!debt.isPaid && (
                              <Button variant="ghost" size="sm" className="h-7 text-[8px] font-black uppercase flex-1 rounded-lg text-destructive" onClick={() => deleteSupplierDebt(debt.id)}>
                                <Trash2 className="w-3 h-3 mr-1" /> Borrar
                              </Button>
                            )}
                          </div>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </Card>
              ))}
            </div>
          </ScrollArea>
          
          <div className="p-6 bg-muted/30 border-t flex gap-4 shrink-0">
            <Button variant="outline" className="flex-1 h-12 font-bold text-destructive border-destructive/20 hover:bg-destructive/10" onClick={handleDeleteFolderAction}>
              <Trash2 className="w-4 h-4 mr-2" /> Eliminar Carpeta Histórica
            </Button>
            <Button variant="secondary" className="flex-1 h-12 font-bold" onClick={() => setSelectedFolder(null)}>Cerrar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* MODAL RENOMBRAR CARPETA */}
      <Dialog open={isRenameModalOpen} onOpenChange={setIsRenameModalOpen}>
        <DialogContent className="max-w-md rounded-[2.5rem] border-none shadow-2xl p-0 overflow-hidden">
          <div className="bg-primary p-6 text-white text-center">
            <DialogTitle className="text-2xl font-black">Renombrar Proveedor</DialogTitle>
          </div>
          <div className="p-8 space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-black uppercase">Nuevo Nombre Comercial</Label>
              <Input value={newSupplierName} onChange={e => setNewSupplierName(e.target.value)} autoFocus />
            </div>
            <p className="text-[10px] text-muted-foreground italic">Esto actualizará todos los tickets pendientes y pagados de este proveedor.</p>
          </div>
          <DialogFooter className="p-8 pt-0">
             <Button onClick={handleRenameFolderAction} className="w-full h-14 rounded-2xl font-black uppercase">Confirmar Cambio</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL PAGO EN CASCADA */}
      <Dialog open={isCascadingModalOpen} onOpenChange={setIsCascadingModalOpen}>
        <DialogContent className="max-w-md rounded-[2.5rem] p-0 overflow-hidden border-none shadow-2xl">
          <div className="bg-amber-500 p-6 text-white text-center">
            <DialogTitle className="text-2xl font-black">Abonar a {targetSupplier?.name}</DialogTitle>
            <p className="text-white/80 font-bold mt-1 uppercase text-[10px] tracking-widest">Pago Inteligente (Cascada)</p>
          </div>
          <div className="p-8 space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-muted-foreground">Monto de la Entrega ($)</Label>
                <Input 
                  type="number" 
                  placeholder="0.00" 
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="h-14 rounded-2xl bg-muted/30 border-none text-2xl font-black text-amber-600 text-center"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-muted-foreground">Método de Pago</Label>
                <div className="grid grid-cols-2 gap-2">
                  {['Efectivo', 'Transferencia', 'Tarjeta'].map(m => (
                    <Button 
                      key={m}
                      variant={paymentMethod === m ? "default" : "outline"}
                      className="h-10 rounded-xl text-xs font-bold"
                      onClick={() => setPaymentMethod(m as any)}
                    >
                      {m}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
            <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20">
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Este pago se aplicará automáticamente a las facturas <strong>más antiguas</strong> primero hasta agotar el saldo.
              </p>
            </div>
          </div>
          <DialogFooter className="p-8 pt-0 flex flex-col gap-2">
            <Button onClick={handleCascadingPayment} disabled={!paymentAmount || parseFloat(paymentAmount) <= 0} className="w-full h-14 rounded-2xl text-lg font-black uppercase shadow-xl bg-amber-500 hover:bg-amber-600">
              Confirmar Abono
            </Button>
            <Button variant="ghost" onClick={() => setIsCascadingModalOpen(false)} className="w-full h-10 rounded-xl font-bold">Cancelar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
