
"use client";

import { useState, useMemo, useEffect, useRef } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { ClientOnly } from '@/components/ClientOnly';
import { useMarketStore } from '@/lib/store';
import { 
  Search, 
  ShoppingCart, 
  Plus, 
  Minus, 
  Trash2, 
  Scale, 
  PlusCircle,
  Banknote,
  Smartphone,
  CreditCard,
  Loader2,
  Printer,
  CheckCircle2,
  Sparkles,
  Zap,
  AlertTriangle,
  Lock,
  ShoppingBasket,
  Truck,
  Calculator,
  UserPlus,
  WifiOff,
  CloudAlert
} from 'lucide-react';
import { useCollection, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import { collection, query, where, limit, doc } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Product, SaleItem, PaymentMethod, ExtraCharge, Customer, Sale, MeatFolder } from '@/lib/types';
import { cn, formatCurrency } from '@/lib/utils';
import { downloadTicketTxt } from '@/lib/ticket-formatter';
import { processScaleCommand } from '@/ai/flows/scale-calculator-flow';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { BotonCobrar } from '@/components/pos/BotonCobrar';
import { normalizeQuantityForCategory } from '@/lib/taller-validators';
import { enqueueReceipt, enqueueAfipRequest } from '@/lib/taller-db';
import { OfflineBadge } from '@/components/OfflineBadge';
import { FiscalBadge } from '@/components/FiscalBadge';
import { getFiscalConfig, buildAfipPayload, getCbteTipo, type LineInput } from '@/lib/taller-fiscal';

export default function POSPage() {
  return (
    <ClientOnly>
      <AppLayout>
        <POSContent />
      </AppLayout>
    </ClientOnly>
  );
}

function POSContent() {
  const db = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  const { addSale } = useMarketStore();

  // --- REFS PARA PERFORMANCE ---
  const inputRef = useRef<HTMLInputElement>(null);
  const processingQueueRef = useRef<boolean>(false);
  const [scanQueue, setScanQueue] = useState<string[]>([]);

  // --- DATOS CLOUD ---
  const productsQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(collection(db, 'productos'), where('userId', '==', user.uid));
  }, [db, user?.uid]);

  const customersQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(collection(db, 'customers'), where('userId', '==', user.uid));
  }, [db, user?.uid]);

  const meatFoldersQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(collection(db, 'meat_folders'), where('userId', '==', user.uid));
  }, [db, user?.uid]);

  const activeShiftQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(collection(db, 'shifts'), where('userId', '==', user.uid), where('isClosed', '==', false), limit(1));
  }, [db, user?.uid]);

  const { data: productsRaw, isLoading: productsLoading, error: productsError } = useCollection<Product>(productsQuery);
  const { data: customers } = useCollection<Customer>(customersQuery);
  const { data: meatFolders } = useCollection<MeatFolder>(meatFoldersQuery);
  const { data: activeShifts, isLoading: shiftsLoading } = useCollection<any>(activeShiftQuery);
  const activeSession = activeShifts?.[0];

  // --- PERSISTENCIA DE CATÁLOGO (Fallback Offline) ---
  const [localCatalog, setLocalCatalog] = useState<Product[]>([]);
  const [isOfflineMode, setIsOfflineMode] = useState(false);

  useEffect(() => {
    if (productsRaw && productsRaw.length > 0) {
      setLocalCatalog(productsRaw);
      localStorage.setItem('mf_product_catalog', JSON.stringify(productsRaw));
      setIsOfflineMode(false);
    } else if (productsError) {
      const saved = localStorage.getItem('mf_product_catalog');
      if (saved) {
        setLocalCatalog(JSON.parse(saved));
        setIsOfflineMode(true);
      }
    }
  }, [productsRaw, productsError]);

  // MAPA DE BÚSQUEDA RÁPIDA (EL ESTANTE DEL BIBLIOTECARIO)
  const productMap = useMemo(() => {
    const map = new Map<string, Product>();
    localCatalog.forEach(p => {
      if (p.codigoBarras) map.set(p.codigoBarras, p);
    });
    return map;
  }, [localCatalog]);

  // --- ESTADOS LOCALES ---
  const [isHydrated, setIsHydrated] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [cart, setCart] = useState<SaleItem[]>([]);
  const [extraCharges, setExtraCharges] = useState<ExtraCharge[]>([]);
  
  const [scaleCommand, setScaleCommand] = useState('');
  const [isScaleLoading, setIsScaleLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Efectivo');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isSuccessOpen, setIsSuccessOpen] = useState(false);
  const [lastSale, setLastSale] = useState<Sale | null>(null);
  const [aiWarnings, setAiWarnings] = useState<string[]>([]);
  const [currentCheckoutId, setCurrentCheckoutId] = useState<string | null>(null);

  const [selectedScaleProduct, setSelectedScaleProduct] = useState<Product | null>(null);
  const [scaleGrams, setScaleGrams] = useState('');
  const [scaleAmount, setScaleAmount] = useState('');
  const [isExtraChargeModalOpen, setIsExtraChargeModalOpen] = useState(false);
  const [extraChargeForm, setExtraChargeForm] = useState({ name: '', amount: '', meatFolderId: '' });
  const [customerPaidAmount, setCustomerPaidAmount] = useState('');

  // --- PERSISTENCIA LOCAL (Anti-pérdida de datos) ---
  useEffect(() => {
    const savedCart = localStorage.getItem('mf_pos_cart');
    const savedExtras = localStorage.getItem('mf_pos_extras');
    if (savedCart) try { setCart(JSON.parse(savedCart)); } catch(e) {}
    if (savedExtras) try { setExtraCharges(JSON.parse(savedExtras)); } catch(e) {}
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (isHydrated) {
      localStorage.setItem('mf_pos_cart', JSON.stringify(cart));
      localStorage.setItem('mf_pos_extras', JSON.stringify(extraCharges));
    }
  }, [cart, extraCharges, isHydrated]);

  // --- LÓGICA DE COLA DE ESCANEO (Queue con Delay de 50ms) ---
  useEffect(() => {
    if (scanQueue.length > 0 && !processingQueueRef.current) {
      processQueue();
    }
  }, [scanQueue]);

  const processQueue = async () => {
    if (scanQueue.length === 0) return;
    processingQueueRef.current = true;

    const code = scanQueue[0];
    
    try {
      if (code.length === 13 && code.startsWith('2')) {
        const itemCode = code.substring(1, 6);
        const weightGr = parseInt(code.substring(6, 11));
        const product = localCatalog.find(p => p.codigoBarras.includes(itemCode));
        if (product) {
          const calculatedPrice = (product.precioVenta / 1000) * weightGr;
          addToCart(product, weightGr, calculatedPrice);
        }
      } else {
        const product = productMap.get(code);
        if (product) {
          addToCart(product);
        }
      }
    } catch (e) {
      console.error("Error procesando cola de escaneo:", e);
    }

    await new Promise(r => setTimeout(r, 50)); 
    setScanQueue(prev => prev.slice(1));
    processingQueueRef.current = false;
  };

  // MANEJO DE ESCANEO OPTIMIZADO CON ESCUDO PROTECTOR
  const handleInputScan = (val: string) => {
    // Detectamos si hay un código de barras (8-13 dígitos) al final del string
    // Esto resuelve el problema de "cremoso7791234567890"
    const barcodeMatch = val.match(/(\d{8,13})$/);
    
    if (barcodeMatch) {
      const potentialCode = barcodeMatch[1];
      const exactMatch = productMap.get(potentialCode);
      
      if (exactMatch) {
        addToCart(exactMatch);
        setSearchTerm('');
        return;
      }
      
      // Caso de balanza (Empieza con 2 y tiene 13 dígitos)
      if (potentialCode.length === 13 && potentialCode.startsWith('2')) {
        setScanQueue(prev => [...prev, potentialCode]);
        setSearchTerm('');
        return;
      }
    }
    
    setSearchTerm(val);
  };

  const addToCart = (product: Product, customWeight?: number, customTotal?: number) => {
    // TallerFlow: venta solo en mostrador, bidones enteros — nunca fraccionado
    // El viejo flujo de Fiambrería/Carnicería queda deshabilitado
    if (product.isVariablePrice && !customWeight) {
      // variable price legacy: lo tratamos como unidad entera en taller
    }

    const price = customTotal ? customTotal : product.precioVenta;
    // Si viene de balanza legacy con 13 dígitos (empieza con 2), ignoramos gr y forzamos 1 unidad
    let qty: number;
    if (customWeight) {
      // legacy pesable → 1 bidón entero, no gramos
      qty = 1;
    } else {
      qty = 1;
    }
    qty = normalizeQuantityForCategory(qty, product.category as any);

    setCart(prev => {
      const existingIdx = prev.findIndex(item => item.productId === product.id && !customWeight);
      if (existingIdx > -1 && !customWeight) {
        const newCart = [...prev];
        const item = newCart[existingIdx];
        const newQty = normalizeQuantityForCategory(item.quantity + 1, product.category as any);
        newCart[existingIdx] = { ...item, quantity: newQty, total: newQty * item.price };
        return newCart;
      } else {
        return [...prev, {
          productId: product.id,
          name: product.name,
          quantity: qty,
          price: product.precioVenta,
          buyPrice: product.precioCosto,
          total: price
        }];
      }
    });

    setSearchTerm('');
    inputRef.current?.focus();
  };

  // --- FILTROS DE VISTA ---
  const filteredProducts = useMemo(() => {
    if (!searchTerm) return localCatalog.slice(0, 48);
    
    const lower = searchTerm.toLowerCase();
    return localCatalog
      .filter(p => 
        p.name.toLowerCase().includes(lower) || 
        p.codigoBarras?.includes(searchTerm)
      )
      .slice(0, 48);
  }, [localCatalog, searchTerm]);

  const deliProducts = useMemo(() => {
    return localCatalog.filter(p => p.category === 'Fiambrería' || p.category === 'Lácteos' || p.isVariablePrice);
  }, [localCatalog]);

  const cartTotal = useMemo(() => {
    const itemsTotal = cart.reduce((acc, item) => acc + item.total, 0);
    const extrasTotal = extraCharges.reduce((acc, extra) => acc + extra.amount, 0);
    return itemsTotal + extrasTotal;
  }, [cart, extraCharges]);

  const totalProductsCount = useMemo(() => {
    const itemsCount = cart.reduce((acc, item) => {
      return acc + (item.quantity >= 1 ? Math.floor(item.quantity) : 1);
    }, 0);
    return itemsCount + extraCharges.length;
  }, [cart, extraCharges]);

  const changeAmount = useMemo(() => {
    const paid = parseFloat(customerPaidAmount);
    if (isNaN(paid) || paid < cartTotal) return 0;
    return paid - cartTotal;
  }, [customerPaidAmount, cartTotal]);

  const handleCheckout = async () => {
    if (!activeSession) return;

    const customerName = customers?.find(c => c.id === selectedCustomerId)?.name || '';
    const saleToRegister = {
      items: cart,
      extraCharges: extraCharges,
      total: cartTotal,
      paymentMethod,
      customerId: selectedCustomerId || null,
      customerName: customerName || null
    };

    const finishLocal = (id: string, offline = false) => {
      setLastSale({ ...saleToRegister, id, timestamp: Date.now() } as any);
      setAiWarnings([]);
      setCart([]);
      setExtraCharges([]);
      localStorage.removeItem('mf_pos_cart');
      localStorage.removeItem('mf_pos_extras');
      setIsCheckoutOpen(false);
      setIsSuccessOpen(true);
      setCustomerPaidAmount('');
      setCurrentCheckoutId(null);
      if (offline) {
        toast({ title: 'Venta guardada offline', description: 'Sin conexión: se sincronizará sola al volver el WiFi. ¡No perdés la venta!' });
      }
    };

    const isOfflineNow = typeof navigator !== 'undefined' && !navigator.onLine;
    // Helper para encolar CAE WSFE idempotente por receipt.id
    const queueCaeForReceipt = async (receiptId: string) => {
      try {
        const cfg = getFiscalConfig();
        if (!cfg.cuit) return; // sin CUIT configurado = no fiscal
        const ivaIncluido = cfg.ivaIncluido;
        // Mapea cada bidón/repuesto a alícuota por categoría (hoy todas 21%); unitPriceIncl = precio mostrado
        const lines: LineInput[] = cart.map(c => {
          const prod = localCatalog.find(p=>p.id===c.productId);
          const rate = (prod as any)?.taxRate ?? 0.21;
          return { quantity: c.quantity, unitPriceIncl: c.price, taxRate: rate, ivaIncluido };
        });
        if (!lines.length) return;
        const receptorCond = (customers?.find(x=>x.id===selectedCustomerId) as any)?.condicionIva as any || 'Consumidor Final';
        const cbteTipo = getCbteTipo(cfg.condicionIva as any, receptorCond as any);
        const docNro = (customers?.find(x=>x.id===selectedCustomerId) as any)?.cuit || '0';
        const docTipo = docNro && docNro.replace(/\D/g,'').length===11 ? 80 : 99;
        const payload = buildAfipPayload({ clientUuid: receiptId, cuitEmisor: cfg.cuit, ptoVta: cfg.ptoVta, cbteTipo, docTipoReceptor: docTipo, docNroReceptor: docNro, condicionEmisor: cfg.condicionIva as any, condicionReceptor: receptorCond, lines });
        await enqueueAfipRequest({ receiptId, payload });
      } catch (e) { console.warn('CAE queue skip', e); }
    };
    if (isOfflineNow) {
      try {
        const localUid = (typeof window !== 'undefined' && window.localStorage.getItem('mf_offline_uid')) || 'local-user';
        const receipt = await enqueueReceipt({
          userId: localUid,
          lines: cart.map(c => ({ productId: c.productId, quantity: c.quantity, unitPrice: c.price })),
          payments: [{ type: paymentMethod as any, amount: cartTotal }],
          customerId: selectedCustomerId || undefined,
        } as any);
        await queueCaeForReceipt(receipt.id);
        finishLocal(receipt.id, true);
        return;
      } catch {}
    }

    try {
      const result: any = await addSale(activeSession.id, saleToRegister, currentCheckoutId || undefined);
      try { await queueCaeForReceipt(result?.id || currentCheckoutId || `cloud_${Date.now()}`); } catch {}
      setLastSale({ ...saleToRegister, id: result?.id || 'temp', timestamp: Date.now() } as any);
      setAiWarnings(result?.warnings || []);
      setCart([]);
      setExtraCharges([]);
      localStorage.removeItem('mf_pos_cart');
      localStorage.removeItem('mf_pos_extras');
      setIsCheckoutOpen(false);
      setIsSuccessOpen(true);
      setCustomerPaidAmount('');
      setCurrentCheckoutId(null);
    } catch (e: any) {
      // Fallback offline-first estilo Loyverse: no se pierde la venta
      try {
        const localUid2 = (typeof window !== 'undefined' && window.localStorage.getItem('mf_offline_uid')) || 'local-user';
        const receipt = await enqueueReceipt({
          userId: localUid2,
          lines: cart.map(c => ({ productId: c.productId, quantity: c.quantity, unitPrice: c.price })),
          payments: [{ type: paymentMethod as any, amount: cartTotal }],
          customerId: selectedCustomerId || undefined,
        } as any);
        await queueCaeForReceipt(receipt.id);
        finishLocal(receipt.id, true);
      } catch {
        toast({
          title: "Error en la Venta",
          description: "No se pudo guardar ni offline. Reintentá en unos segundos.",
          variant: "destructive"
        });
      }
    }
  };

  const updateQuantity = (productId: string, newQty: number) => {
    setCart(prev => {
      // Normaliza a entero: taller no fracciona bidones
      const product = localCatalog.find(p => p.id === productId);
      const safeQty = product ? normalizeQuantityForCategory(newQty, product.category as any) : Math.max(0, Math.floor(newQty));
      if (safeQty <= 0) return prev.filter(item => item.productId !== productId);
      return prev.map(item => 
        item.productId === productId ? { ...item, quantity: safeQty, total: safeQty * item.price } : item
      );
    });
  };

  const liveScaleCalculation = useMemo(() => {
    if (!selectedScaleProduct) return null;
    const price = selectedScaleProduct.precioVenta;
    if (scaleGrams) {
      const weight = parseFloat(scaleGrams);
      return { total: (price / 1000) * weight, weight };
    }
    if (scaleAmount) {
      const amount = parseFloat(scaleAmount);
      return { total: amount, weight: (amount / price) * 1000 };
    }
    return null;
  }, [selectedScaleProduct, scaleGrams, scaleAmount]);

  if (shiftsLoading || (productsLoading && localCatalog.length === 0)) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
        <p className="text-muted-foreground font-medium">Sincronizando Terminal POS...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 h-[calc(100vh-140px)] animate-in fade-in duration-500">
      <div className="flex justify-end -mb-2 gap-2 flex-wrap"><OfflineBadge /><FiscalBadge /></div>
      {/* BANNER DE CONTINGENCIA */}
      {isOfflineMode && (
        <Alert variant="destructive" className="rounded-2xl bg-amber-500/10 border-amber-500/30 animate-pulse">
          <CloudAlert className="w-4 h-4 text-amber-600" />
          <AlertTitle className="text-amber-700 font-black uppercase text-xs">Sincronización Diferida por Alta Demanda</AlertTitle>
          <AlertDescription className="text-amber-600 text-[10px] font-bold">
            Operando con catálogo local. Tus ventas se guardarán localmente hasta que el servidor responda.
          </AlertDescription>
        </Alert>
      )}

      {/* --- SECCIÓN DE LA CAJA --- */}
      <div className="flex-[4] flex flex-col min-h-0 overflow-hidden">
        <Card className="rounded-[2.5rem] border-none shadow-2xl bg-card flex flex-col h-full overflow-hidden">
          <CardHeader className="bg-primary p-4 text-primary-foreground shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5" />
                <CardTitle className="text-lg font-black tracking-tight">Detalle de Venta</CardTitle>
                <button onClick={() => setIsExtraChargeModalOpen(true)} className="ml-2 p-1 hover:bg-white/20 rounded-full transition-colors">
                  <PlusCircle className="w-5 h-5" />
                </button>
              </div>
              <Badge variant="outline" className="text-white border-white/20 text-[9px] font-bold uppercase">
                {totalProductsCount} Ítems Totales
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="flex-1 overflow-hidden p-0 flex flex-col">
            <ScrollArea className="flex-1 px-4 py-3">
              <div className="space-y-1.5">
                {cart.map((item, idx) => (
                  <div key={`${item.productId}-${idx}`} className="flex items-center justify-between gap-3 p-2.5 rounded-2xl bg-muted/40 group hover:bg-muted/60 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm uppercase leading-tight truncate">{item.name}</p>
                      <p className="text-[10px] text-muted-foreground font-medium mt-0.5">
                        {item.quantity < 1 ? `${(item.quantity * 1000).toFixed(0)}gr` : `${item.quantity.toFixed(2)} un`} x {formatCurrency(item.price)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 bg-background px-2 py-0.5 rounded-xl shadow-sm">
                      <button onClick={() => updateQuantity(item.productId, item.quantity - (item.quantity < 1 ? 0.1 : 1))} className="p-0.5 hover:text-primary transition-colors"><Minus className="w-3 h-3" /></button>
                      <span className="font-black text-[11px] min-w-[18px] text-center">{item.quantity < 1 ? (item.quantity * 1000).toFixed(0) : item.quantity}</span>
                      <button onClick={() => updateQuantity(item.productId, item.quantity + (item.quantity < 1 ? 0.1 : 1))} className="p-0.5 hover:text-primary transition-colors"><Plus className="w-3 h-3" /></button>
                    </div>
                    <div className="text-right min-w-[65px]">
                      <p className="font-black text-primary text-xs tracking-tighter">{formatCurrency(item.total)}</p>
                    </div>
                    <button onClick={() => updateQuantity(item.productId, 0)} className="text-destructive p-1 hover:bg-destructive/10 rounded-full transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
                {extraCharges.map((ex, i) => (
                  <div key={i} className={cn(
                    "flex items-center justify-between gap-3 p-2.5 rounded-2xl border",
                    ex.isBalanza ? "bg-primary/5 border-primary/20" : "bg-accent/10 border-accent/20"
                  )}>
                    <div className="flex-1">
                      <p className={cn("font-bold text-sm uppercase", ex.isBalanza ? "text-primary" : "text-accent-foreground")}>
                        {ex.name || 'Extra'} {ex.isBalanza && "🥩"}
                      </p>
                    </div>
                    <p className={cn("font-black text-xs", ex.isBalanza ? "text-primary" : "text-accent")}>{formatCurrency(ex.amount)}</p>
                    <button onClick={() => setExtraCharges(prev => prev.filter((_, idx) => idx !== i))} className="text-destructive p-1 hover:bg-destructive/10 rounded-full transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
            </ScrollArea>

            <div className="p-4 bg-muted/10 border-t shrink-0 flex items-center justify-between gap-6">
              <div className="flex items-center gap-10">
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Recuento de Productos</span>
                  <span className="text-3xl font-black text-foreground tracking-tighter leading-none">{totalProductsCount}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Total a Cobrar</span>
                  <span className="text-3xl font-black text-primary tracking-tighter leading-none">{formatCurrency(cartTotal)}</span>
                </div>
              </div>
              <Button 
                onClick={() => {
                  if (!activeSession) return;
                  setCurrentCheckoutId(doc(collection(db, 'sales')).id);
                  setIsCheckoutOpen(true);
                }} 
                disabled={cartTotal <= 0 || !activeSession} 
                className="h-14 px-10 rounded-2xl text-lg font-black uppercase shadow-2xl"
              >
                {!activeSession ? "Caja Cerrada" : "Finalizar y Cobrar"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* --- SECCIÓN DE BÚSQUEDA --- */}
      <div className="flex-[1.5] flex flex-col min-h-0 overflow-hidden">
        <Card className="rounded-[2rem] border-none shadow-xl bg-card overflow-hidden flex flex-col h-full">
          <div className="p-3 border-b bg-muted/20 flex items-center gap-4 shrink-0">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input 
                ref={inputRef}
                placeholder="Escanear o buscar..." 
                className="pl-9 h-10 rounded-xl bg-background border-none shadow-inner text-sm"
                value={searchTerm}
                onChange={(e) => handleInputScan(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    // Si el contenido actual es numérico puro (un código no reconocido aún), intentamos forzar lectura y limpiamos
                    if (/^\d+$/.test(searchTerm) && searchTerm.length >= 8) {
                      handleInputScan(searchTerm);
                    }
                    setSearchTerm(''); // Limpieza absoluta tras Enter
                  }
                }}
                autoFocus
              />
            </div>

            <form onSubmit={async (e) => {
              e.preventDefault();
              if (!scaleCommand) return;
              setIsScaleLoading(true);
              try {
                const result = await processScaleCommand({ command: scaleCommand, availableProducts: deliProducts.map(p => ({ id: p.id, name: p.name, price: p.precioVenta })) });
                if (result.found) {
                  const product = localCatalog.find(p => p.id === result.productId);
                  if (product) addToCart(product, result.weightGr, result.totalPrice);
                  setScaleCommand('');
                }
              } catch (err) {
                toast({ title: "Error IA", description: "Reintentando por alta demanda...", variant: "destructive" });
              }
              setIsScaleLoading(false);
            }} className="flex gap-2 flex-[0.7]">
              <div className="relative flex-1">
                <Zap className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-500 w-3.5 h-3.5" />
                <Input 
                  placeholder='IA Pesables...' 
                  className="pl-9 h-10 rounded-xl bg-amber-500/5 border-amber-500/20 font-bold text-xs"
                  value={scaleCommand}
                  onChange={(e) => setScaleCommand(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={isScaleLoading} className="h-10 w-10 rounded-xl bg-amber-500 text-white p-0">
                {isScaleLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              </Button>
            </form>
          </div>

          <ScrollArea className="flex-1 p-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
              {filteredProducts.map(product => {
                const isScaleItem = product.category === 'Fiambrería' || product.category === 'Carnicería' || product.isVariablePrice;
                return (
                  <button
                    key={product.id}
                    onClick={() => {
                      addToCart(product);
                      setSearchTerm(''); // Limpiar buscador al hacer clic en producto
                    }}
                    className={cn(
                      "flex flex-col p-2 rounded-xl transition-all border-2 text-left relative min-h-[70px] shadow-sm",
                      product.stock <= (product.minStock || 5) ? "bg-destructive/5 border-destructive/20" : "bg-muted/30 border-transparent hover:border-primary/40"
                    )}
                  >
                    <p className="font-bold text-[9px] leading-tight flex-1 line-clamp-2 uppercase">{product.name}</p>
                    <div className="mt-auto flex justify-between items-end">
                      <p className="text-xs font-black text-primary">{formatCurrency(product.precioVenta)}</p>
                      {isScaleItem && <Scale className="w-2.5 h-2.5 text-amber-500" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </Card>
      </div>

      {/* --- MODALES --- */}
      <Dialog open={!!selectedScaleProduct} onOpenChange={(open) => !open && setSelectedScaleProduct(null)}>
        <DialogContent className="max-w-md rounded-[2.5rem] p-0 overflow-hidden border-none shadow-2xl">
          <div className="bg-primary p-6 text-white text-center">
            <DialogTitle className="text-2xl font-black uppercase">{selectedScaleProduct?.name}</DialogTitle>
            <p className="text-white/80 font-bold mt-1 uppercase text-[10px]">Precio x KG: {formatCurrency(selectedScaleProduct?.precioVenta || 0)}</p>
          </div>
          <div className="p-8 space-y-6">
            <div className="space-y-4">
              <Label className="text-[10px] font-black uppercase text-muted-foreground">Peso (gr) o Importe ($)</Label>
              <div className="grid grid-cols-1 gap-4">
                <Input type="number" placeholder="Gramos (ej: 250)" value={scaleGrams} onChange={e => { setScaleGrams(e.target.value); if (e.target.value) setScaleAmount(''); }} className="h-14 rounded-2xl text-2xl font-black text-center" autoFocus />
                <Input type="number" placeholder="Dinero (ej: 500)" value={scaleAmount} onChange={e => { setScaleAmount(e.target.value); if (e.target.value) setScaleGrams(''); }} className="h-14 rounded-2xl text-2xl font-black text-center text-emerald-600" />
              </div>
              {liveScaleCalculation && (
                <div className="p-4 bg-primary/5 rounded-2xl border-2 border-primary/20 text-center">
                  <p className="text-4xl font-black text-primary">{formatCurrency(liveScaleCalculation.total)}</p>
                  <p className="text-[9px] font-bold text-muted-foreground mt-1 uppercase">{liveScaleCalculation.weight.toFixed(0)}gr EQUIVALENTE</p>
                </div>
              )}
            </div>
            <Button onClick={() => { if (selectedScaleProduct && liveScaleCalculation) { addToCart(selectedScaleProduct, liveScaleCalculation.weight, liveScaleCalculation.total); setSelectedScaleProduct(null); } }} className="w-full h-16 rounded-2xl text-lg font-black uppercase">Añadir a la Caja</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* MODAL COBRO */}
      <Dialog open={isCheckoutOpen} onOpenChange={setIsCheckoutOpen}>
        <DialogContent className="max-w-md rounded-[2.5rem] border-none p-0 overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
          <DialogHeader className="bg-primary p-6 text-primary-foreground text-center shrink-0">
            <DialogTitle className="text-2xl font-black">{formatCurrency(cartTotal)}</DialogTitle>
            <p className="text-[10px] font-black uppercase opacity-80">Finalizar Venta</p>
          </DialogHeader>
          
          <ScrollArea className="flex-1">
            <div className="p-6 space-y-6">
              <RadioGroup value={paymentMethod} onValueChange={(v: any) => setPaymentMethod(v)} className="grid grid-cols-2 gap-2">
                {['Efectivo', 'Transferencia', 'Tarjeta', 'Fiado'].map(method => (
                  <Label key={method} htmlFor={method} className={cn("flex flex-col items-center justify-center aspect-square rounded-xl border-2 cursor-pointer gap-2", paymentMethod === method ? "border-primary bg-primary/5 text-primary" : "border-muted-foreground/10")}>
                    <RadioGroupItem value={method} id={method} className="sr-only" />
                    {method === 'Efectivo' && <Banknote />}
                    {method === 'Transferencia' && <Smartphone />}
                    {method === 'Tarjeta' && <CreditCard />}
                    {method === 'Fiado' && <UserPlus />}
                    <span className="text-[9px] font-bold uppercase">{method}</span>
                  </Label>
                ))}
              </RadioGroup>

              {paymentMethod === 'Efectivo' && (
                <div className="space-y-4 p-5 rounded-3xl bg-emerald-500/5 border border-emerald-500/20">
                  <Input type="number" placeholder="Paga con..." value={customerPaidAmount} onChange={e => setCustomerPaidAmount(e.target.value)} className="h-14 rounded-2xl text-2xl font-black text-emerald-600 text-center" autoFocus />
                  {parseFloat(customerPaidAmount) >= cartTotal && (
                    <div className="text-center">
                      <p className="text-[10px] font-bold text-muted-foreground">VUELTO:</p>
                      <p className="text-4xl font-black text-emerald-600">{formatCurrency(changeAmount)}</p>
                    </div>
                  )}
                </div>
              )}

              {paymentMethod === 'Fiado' && (
                <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
                  <SelectTrigger className="h-14 rounded-2xl font-bold"><SelectValue placeholder="Seleccionar deudor..." /></SelectTrigger>
                  <SelectContent>{customers?.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              )}
            </div>
          </ScrollArea>

          <div className="p-6 pt-2 border-t">
            <BotonCobrar onConfirm={handleCheckout} />
          </div>
        </DialogContent>
      </Dialog>

      {/* MODAL ÉXITO */}
      <Dialog open={isSuccessOpen} onOpenChange={setIsSuccessOpen}>
        <DialogContent className="max-w-md rounded-[2.5rem] p-0 overflow-hidden shadow-2xl">
          <div className="bg-emerald-500 p-10 text-white text-center flex flex-col items-center gap-4">
            <CheckCircle2 className="w-16 h-16" />
            <DialogTitle className="text-3xl font-black">Venta Exitosa</DialogTitle>
          </div>
          <div className="p-8 space-y-6">
            <div className="text-center">
              <p className="text-[10px] font-black text-muted-foreground">TOTAL COBRADO</p>
              <p className="text-5xl font-black text-emerald-600">{formatCurrency(lastSale?.total || 0)}</p>
            </div>
            <div className="grid grid-cols-1 gap-3">
              <Button onClick={() => lastSale && downloadTicketTxt(lastSale)} variant="outline" className="h-14 rounded-2xl border-2 font-black uppercase text-xs gap-3">
                <Printer className="w-5 h-5" /> Descargar Ticket
              </Button>
              <Button onClick={() => { setIsSuccessOpen(false); inputRef.current?.focus(); }} className="h-16 rounded-2xl bg-primary font-black uppercase text-lg shadow-xl">Nueva Venta</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* MODAL CARGO EXTRA */}
      <Dialog open={isExtraChargeModalOpen} onOpenChange={setIsExtraChargeModalOpen}>
        <DialogContent className="max-w-md rounded-[2.5rem] border-none p-0 overflow-hidden shadow-2xl">
          <div className="bg-accent p-6 text-accent-foreground text-center">
            <DialogTitle className="text-2xl font-black">Cargo Extra</DialogTitle>
            <p className="text-[10px] font-black uppercase opacity-80">Conceptos manuales o varios</p>
          </div>
          <div className="p-8 space-y-4">
             <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase">Nombre del Concepto</Label>
                <Input placeholder="Ej: Bolsas, Envío, Redondeo..." value={extraChargeForm.name} onChange={e => setExtraChargeForm({...extraChargeForm, name: e.target.value})} />
             </div>
             <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase">Monto ($)</Label>
                <Input type="number" placeholder="0.00" value={extraChargeForm.amount} onChange={e => setExtraChargeForm({...extraChargeForm, amount: e.target.value})} />
             </div>
             <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase">Carpeta Balanza (Opcional)</Label>
                <Select value={extraChargeForm.meatFolderId} onValueChange={v => setExtraChargeForm({...extraChargeForm, meatFolderId: v})}>
                  <SelectTrigger><SelectValue placeholder="Sin carpeta..." /></SelectTrigger>
                  <SelectContent>{meatFolders?.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
                </Select>
             </div>
          </div>
          <div className="p-8 pt-0">
            <Button onClick={() => { if(extraChargeForm.amount) { setExtraCharges([...extraCharges, { name: extraChargeForm.name || 'Varios', amount: parseFloat(extraChargeForm.amount), isBalanza: !!extraChargeForm.meatFolderId, meatFolderId: extraChargeForm.meatFolderId }]); setExtraChargeForm({ name: '', amount: '', meatFolderId: '' }); setIsExtraChargeModalOpen(false); } }} className="w-full h-14 rounded-2xl bg-accent text-accent-foreground font-black uppercase">Añadir Cargo</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
