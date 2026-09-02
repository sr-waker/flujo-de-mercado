"use client";

import { useState, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { ClientOnly } from '@/components/ClientOnly';
import { useMarketStore } from '@/lib/store';
import { useCollection, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { 
  Plus, 
  Minus,
  Search, 
  Edit2, 
  Trash2, 
  Package, 
  Barcode, 
  Sparkles, 
  Loader2, 
  Globe, 
  Filter, 
  Calculator, 
  ArrowRight,
  TrendingDown,
  AlertCircle,
  BellRing,
  Percent,
  CheckCircle2,
  ArrowRightLeft,
  Info,
  FileDown
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
import { Badge } from '@/components/ui/badge';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Product, Category } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { getProductIntel } from '@/ai/flows/product-intel-flow';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { isBarcodeUnique, normalizeQuantityForCategory } from '@/lib/taller-validators';

const CATEGORIES: Category[] = ['Repuestos', 'Aceites', 'Accesorios', 'Químicos', 'Herramientas', 'Otros'];

export default function InventoryPage() {
  return (
    <ClientOnly>
      <AppLayout>
        <InventoryContent />
      </AppLayout>
    </ClientOnly>
  );
}

function InventoryContent() {
  const db = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();

  const productsQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(collection(db, 'productos'), where('userId', '==', user.uid));
  }, [db, user?.uid]);

  const { data: products, isLoading } = useCollection<Product>(productsQuery);
  
  const { addProduct, updateProduct, deleteProduct } = useMarketStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [originHint, setOriginHint] = useState<string | null>(null);

  const [packageCost, setPackageCost] = useState('');
  const [packageUnits, setPackageUnits] = useState('');
  
  const [marginPercent, setMarginPercent] = useState<number>(0);

  const [formData, setFormData] = useState<Omit<Product, 'id' | 'updatedAt' | 'userId'>>({
    name: '',
    description: '',
    category: 'Repuestos',
    codigoBarras: '',
    isVariablePrice: false,
    precioCosto: 0,
    precioVenta: 0,
    stock: 0,
    minStock: 5,
    porcentajeMerma: 0,
  });

  const filteredProducts = useMemo(() => {
    let list = products || [];
    if (searchTerm) {
      list = list.filter(p => 
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        p.codigoBarras?.includes(searchTerm)
      );
    }
    if (selectedCategory === 'bajo-stock') {
      list = list.filter(p => p.stock <= (p.minStock || 5));
    } else if (selectedCategory !== 'all') {
      list = list.filter(p => p.category === selectedCategory);
    }
    return list;
  }, [products, searchTerm, selectedCategory]);

  const handleExportExcel = () => {
    if (!filteredProducts || filteredProducts.length === 0) {
      toast({ title: "Sin datos", description: "No hay productos para exportar.", variant: "destructive" });
      return;
    }

    const headers = ['Nombre', 'Precio Venta', 'Categoría', 'Stock Actual', 'Código de Barras'];
    const rows = filteredProducts.map(p => [
      p.name,
      p.precioVenta.toFixed(2),
      p.category,
      p.stock.toString(),
      p.codigoBarras || 'SIN EAN'
    ]);

    // Generamos contenido CSV usando punto y coma como separador (estándar Excel en LatAm)
    const csvContent = [
      headers.join(';'),
      ...rows.map(row => row.join(';'))
    ].join('\n');

    // Agregamos el BOM (\uFEFF) para que Excel reconozca UTF-8 (acentos, ñ, etc)
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `inventario-marketflow-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast({ title: "Exportación Exitosa", description: "El archivo se ha descargado correctamente." });
  };

  const projectedPrice = useMemo(() => {
    const base = Number(formData.precioCosto) > 0 ? Number(formData.precioCosto) : (Number(formData.precioVenta) || 0);
    if (base <= 0) return 0;
    const result = base * (1 + (Number(marginPercent) || 0) / 100);
    return Number(result.toFixed(2));
  }, [formData.precioCosto, formData.precioVenta, marginPercent]);

  const handleCostChange = (val: string) => {
    const cost = val === '' ? 0 : parseFloat(val);
    setFormData(prev => ({ ...prev, precioCosto: cost }));
  };

  const handleMarginChange = (val: string) => {
    const margin = val === '' ? 0 : parseFloat(val);
    if (!isNaN(margin)) {
      setMarginPercent(margin);
    }
  };

  const handleSellPriceChange = (val: string) => {
    const sell = val === '' ? 0 : parseFloat(val);
    const cost = Number(formData.precioCosto) || 0;
    
    if (cost > 0 && sell > 0) {
      const margin = ((sell - cost) / cost) * 100;
      setMarginPercent(Number(margin.toFixed(2)));
    } else {
      setMarginPercent(0);
    }
    setFormData(prev => ({ ...prev, precioVenta: sell }));
  };

  const adjustMargin = (amount: number) => {
    setMarginPercent(prev => {
      const newVal = Number((prev + amount).toFixed(2));
      return newVal;
    });
  };

  const applyProjectedPrice = () => {
    setFormData(prev => ({ ...prev, precioVenta: projectedPrice }));
    if (Number(formData.precioCosto) <= 0) {
      setMarginPercent(0);
    }
    toast({ 
      title: "Precio Actualizado", 
      description: `Se ha aplicado el ajuste del ${marginPercent}%`
    });
  };

  const calculateUnitPrice = () => {
    const costTotal = parseFloat(packageCost);
    const units = parseFloat(packageUnits);
    if (costTotal > 0 && units > 0) {
      const unitCost = Number((costTotal / units).toFixed(2));
      setFormData(prev => ({ ...prev, precioCosto: unitCost }));
      toast({ title: "Costo Unitario Calculado", description: `$${unitCost.toLocaleString('es-AR', { minimumFractionDigits: 2 })} por unidad.` });
      setPackageCost('');
      setPackageUnits('');
    }
  };

  const handleAiMagic = async () => {
    if (!formData.codigoBarras || !user) {
      toast({ title: "Sin código", description: "Ingresa un código de barras.", variant: "destructive" });
      return;
    }

    const existing = products?.find(p => p.codigoBarras === formData.codigoBarras);
    if (existing) {
      toast({ title: "Producto Encontrado", description: "El código ya pertenece a " + existing.name });
      handleOpenModal(existing);
      return;
    }

    setIsAiLoading(true);
    setOriginHint(null);
    try {
      const intel = await getProductIntel({ 
        barcode: formData.codigoBarras, 
        costPrice: formData.precioCosto 
      });
      
      setFormData(prev => {
        const sell = intel.suggestedSellPrice;
        const cost = Number(prev.precioCosto) || 0;
        if (cost > 0) {
          const margin = ((sell - cost) / cost) * 100;
          setMarginPercent(Number(margin.toFixed(2)));
        } else {
          setMarginPercent(0);
        }
        return {
          ...prev,
          name: intel.suggestedName,
          category: intel.suggestedCategory as Category,
          description: intel.suggestedDescription,
          precioVenta: sell,
        };
      });

      if (intel.originCountry) setOriginHint(intel.originCountry);
      toast({ title: "IA MarketFlow", description: "Sugerencia inteligente aplicada." });
    } catch (error) {
      toast({ title: "Error IA", description: "No se pudo identificar el código.", variant: "destructive" });
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleOpenModal = (product?: Product) => {
    setOriginHint(null);
    setPackageCost('');
    setPackageUnits('');
    if (product) {
      setEditingProduct(product);
      setFormData({
        name: product.name,
        description: product.description || '',
        category: product.category,
        codigoBarras: product.codigoBarras || '',
        isVariablePrice: product.isVariablePrice || false,
        precioCosto: product.precioCosto || 0,
        precioVenta: product.precioVenta || 0,
        stock: product.stock || 0,
        minStock: product.minStock || 5,
        porcentajeMerma: product.porcentajeMerma || 0,
      });
      
      const cost = product.precioCosto || 0;
      const sell = product.precioVenta || 0;
      if (cost > 0) {
        const margin = ((sell - cost) / cost) * 100;
        setMarginPercent(Number(margin.toFixed(2)));
      } else {
        setMarginPercent(0);
      }
    } else {
      setEditingProduct(null);
      setFormData({
        name: '',
        description: '',
        category: 'Repuestos',
        codigoBarras: '',
        isVariablePrice: false,
        precioCosto: 0,
        precioVenta: 0,
        stock: 0,
        minStock: 5,
        porcentajeMerma: 0,
      });
      setMarginPercent(30); 
    }
    setIsModalOpen(true);
  };

  const handleSave = () => {
    if (!formData.name?.trim()) {
      toast({ title: "Falta Nombre", description: "El producto debe tener un nombre.", variant: "destructive" });
      return;
    }
    // Aspecto 1: bidones enteros con código único obligatorio
    const codigo = (formData.codigoBarras || '').trim();
    if (!codigo) {
      toast({ title: "Falta código de barras", description: "Todo bidón/repuesto necesita su EAN-13 único, Baka. ¡No lo dejes vacío?!", variant: "destructive" });
      return;
    }
    const allCodes = (products || []).map(p => p.codigoBarras || '');
    const editingCode = editingProduct?.codigoBarras || '';
    // isBarcodeUnique ya contempla excluir edición propia
    const unique = isBarcodeUnique(codigo, allCodes.filter(c => c !== editingCode));
    if (!unique) {
      toast({ title: "Código duplicado", description: `El código ${codigo} ya existe. Usá uno único, tonto.`, variant: "destructive" });
      return;
    }
    // Normaliza cantidades a enteros: taller vende bidones enteros, no fracciones
    const safeStock = normalizeQuantityForCategory(formData.stock, formData.category);
    const safeMin = normalizeQuantityForCategory(formData.minStock, formData.category);
    const payload = { ...formData, codigoBarras: codigo, stock: safeStock, minStock: safeMin, porcentajeMerma: 0 } as typeof formData;
    if (editingProduct) {
      updateProduct(editingProduct.id, payload);
    } else {
      addProduct(payload);
    }
    toast({ title: editingProduct ? "Producto actualizado" : "Producto creado", description: `Código ${codigo} · Stock ${safeStock} unidades enteras.` });
    setIsModalOpen(false);
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-4xl font-black text-foreground tracking-tight">Inventario Cloud</h1>
          <p className="text-muted-foreground mt-1 text-lg">Gestión profesional de stock.</p>
        </div>
        <div className="flex gap-3">
          <Button 
            variant="outline" 
            onClick={handleExportExcel} 
            className="rounded-xl h-12 px-6 border-2 font-bold hover:bg-muted"
          >
            <FileDown className="w-5 h-5 mr-2" /> Exportar Excel
          </Button>
          <Button 
            onClick={() => handleOpenModal()} 
            className="rounded-xl h-12 px-8 shadow-xl font-bold bg-primary hover:scale-105 transition-transform"
          >
            <Plus className="w-5 h-5 mr-2" /> Nuevo Producto
          </Button>
        </div>
      </div>

      <div className="bg-card rounded-[2rem] shadow-2xl overflow-hidden border-none">
        <div className="p-8 border-b bg-muted/10 space-y-6">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground w-5 h-5" />
            <Input 
              placeholder="Buscar por nombre o código de barras..." 
              className="pl-12 h-14 rounded-2xl bg-background border-none shadow-inner text-lg font-medium"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <Tabs value={selectedCategory} onValueChange={setSelectedCategory} className="w-full">
            <TabsList className="bg-background/50 p-1 rounded-xl shadow-inner flex h-auto overflow-x-auto justify-start sm:justify-center border border-border/40 gap-1">
              <TabsTrigger value="all" className="rounded-lg px-4 font-bold uppercase text-[10px] tracking-widest py-2">Todos</TabsTrigger>
              <TabsTrigger value="bajo-stock" className="rounded-lg px-4 font-bold uppercase text-[10px] tracking-widest py-2 data-[state=active]:bg-destructive data-[state=active]:text-white">
                <AlertCircle className="w-3 h-3 mr-2" /> Bajo Stock
              </TabsTrigger>
              {CATEGORIES.map(cat => (
                <TabsTrigger key={cat} value={cat} className="rounded-lg px-4 font-bold uppercase text-[10px] tracking-widest py-2">
                  {cat}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow className="border-none">
                <TableHead className="font-black py-5 pl-8 text-foreground uppercase tracking-widest text-xs">Producto</TableHead>
                <TableHead className="font-black text-foreground uppercase tracking-widest text-xs">Categoría</TableHead>
                <TableHead className="font-black text-center text-foreground uppercase tracking-widest text-xs">Stock Actual</TableHead>
                <TableHead className="text-right font-black pr-8 text-foreground uppercase tracking-widest text-xs">Precio Venta</TableHead>
                <TableHead className="text-right pr-8 font-black text-foreground uppercase tracking-widest text-xs">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="h-60 text-center"><Loader2 className="w-10 h-10 animate-spin mx-auto text-primary" /></TableCell></TableRow>
              ) : filteredProducts.length > 0 ? (
                filteredProducts.map((product) => (
                  <TableRow key={product.id} className={cn("hover:bg-muted/50 transition-colors", product.stock <= (product.minStock || 5) ? "bg-destructive/5" : "")}>
                    <TableCell className="pl-8">
                      <div className="flex items-center gap-4">
                        <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm", product.stock <= (product.minStock || 5) ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary")}>
                          <Package className="w-6 h-6" />
                        </div>
                        <div>
                          <p className="font-bold text-lg leading-tight">{product.name}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <p className="text-[10px] font-black font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded-md tracking-tighter">
                              {product.codigoBarras || 'SIN EAN'}
                            </p>
                            {product.porcentajeMerma && product.porcentajeMerma > 0 && (
                              <Badge variant="outline" className="text-[8px] h-4 py-0 uppercase text-amber-600 border-amber-500/30">
                                Merma: {product.porcentajeMerma}%
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell><Badge variant="secondary" className="px-3 py-1 font-bold text-[10px] uppercase tracking-wider">{product.category}</Badge></TableCell>
                    <TableCell className="text-center">
                      <div className="flex flex-col items-center">
                        <span className={cn("text-xl font-black", product.stock <= (product.minStock || 5) ? "text-destructive" : "text-foreground")}>
                          {product.stock.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </span>
                        <span className="text-[9px] text-muted-foreground font-black uppercase tracking-widest">
                          unidades
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right pr-8 font-black text-lg text-primary">
                      ${product.precioVenta.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right pr-8">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" className="rounded-xl hover:bg-primary/10 hover:text-primary transition-colors" onClick={() => handleOpenModal(product)}><Edit2 className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" className="rounded-xl hover:bg-destructive/10 hover:text-destructive transition-colors" onClick={() => deleteProduct(product.id)}><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="h-60 text-center">
                    <div className="flex flex-col items-center opacity-30">
                      <Filter className="w-16 h-16 mb-4" />
                      <p className="text-xl font-black uppercase tracking-widest">Sin productos en esta categoría</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-2xl rounded-[2.5rem] p-0 flex flex-col h-[90vh] overflow-hidden border-none shadow-2xl">
          <div className="bg-primary p-8 text-primary-foreground shrink-0">
            <DialogHeader>
              <DialogTitle className="text-3xl font-black tracking-tight">{editingProduct ? 'Editar' : 'Nuevo'} Producto</DialogTitle>
            </DialogHeader>
          </div>
          
          <ScrollArea className="flex-1 w-full bg-background">
            <div className="p-8 space-y-8">
              <div className="space-y-2">
                <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground">EAN-13 / Código de Barras</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Barcode className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input 
                      placeholder="Código de barras" 
                      value={formData.codigoBarras} 
                      onChange={e => setFormData({ ...formData, codigoBarras: e.target.value })} 
                      className="pl-12 h-14 rounded-2xl bg-muted/30 border-none font-mono font-bold text-foreground"
                    />
                  </div>
                  <Button variant="secondary" onClick={handleAiMagic} disabled={isAiLoading} className="h-14 rounded-2xl px-6 gap-2 font-black shadow-lg">
                    {isAiLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />} IA
                  </Button>
                </div>
                {originHint && (
                  <div className="flex items-center gap-2 text-[10px] font-black text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full w-fit mt-2">
                    <Globe className="w-3 h-3" /> ORIGEN: {originHint}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2 space-y-2">
                  <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground">Nombre Comercial</Label>
                  <Input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="h-14 rounded-xl text-lg font-bold text-foreground" />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground">Categoría</Label>
                  <Select value={formData.category} onValueChange={(v: Category) => setFormData({ ...formData, category: v })}>
                    <SelectTrigger className="h-14 rounded-xl font-bold text-foreground"><SelectValue /></SelectTrigger>
                    <SelectContent className="rounded-xl">{CATEGORIES.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}</SelectContent>
                  </Select>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground">Stock Actual</Label>
                      <Input type="number" step="1" min="0" inputMode="numeric" pattern="[0-9]*" value={formData.stock} onChange={e => setFormData({ ...formData, stock: normalizeQuantityForCategory(parseFloat(e.target.value) || 0, formData.category) })} className="h-14 rounded-xl font-bold text-foreground" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5 text-amber-600">
                        <BellRing className="w-3 h-3" /> Stock Mínimo
                      </Label>
                      <Input type="number" step="1" min="0" inputMode="numeric" value={formData.minStock} onChange={e => setFormData({ ...formData, minStock: normalizeQuantityForCategory(parseFloat(e.target.value) || 0, formData.category) })} className="h-14 rounded-xl font-bold text-amber-600 border-amber-500/20 bg-amber-500/5" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-6 rounded-3xl bg-muted/10 border-2 border-dashed border-muted-foreground/20 space-y-2 opacity-60">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Info className="w-4 h-4" />
                  <span className="text-xs font-black uppercase tracking-widest">TallerMode: sin merma</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  En taller se venden bidones enteros — la merma ya no aplica. Stock descuenta 1 a 1, ¡entendiste?!
                </p>
              </div>

              <div className="p-6 rounded-3xl bg-muted/20 border-2 border-dashed border-muted-foreground/20 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-primary">
                    <Calculator className="w-5 h-5" />
                    <span className="text-xs font-black uppercase tracking-widest">Calculadora de Bultos</span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 items-end">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black opacity-70">Costo Bulto ($)</Label>
                    <Input placeholder="Total" value={packageCost} onChange={e => setPackageCost(e.target.value)} className="h-10 bg-background" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black opacity-70">Unidades</Label>
                    <Input placeholder="Cant." value={packageUnits} onChange={e => setPackageUnits(e.target.value)} className="h-10 bg-background" />
                  </div>
                  <Button onClick={calculateUnitPrice} variant="outline" className="h-10 rounded-xl font-bold border-primary text-primary hover:bg-primary hover:text-white">
                    Calcular <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start bg-primary/5 p-6 rounded-[2rem] border border-primary/10">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 px-1">
                    <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground">Precio Costo ($)</Label>
                  </div>
                  <Input 
                    type="number" 
                    step="0.01" 
                    value={formData.precioCosto} 
                    onChange={e => handleCostChange(e.target.value)} 
                    className="h-14 rounded-xl font-black text-foreground bg-background shadow-sm" 
                  />
                </div>

                <div className="space-y-2 flex flex-col h-full">
                  <div className="flex justify-between items-center px-1">
                    <Label className="text-xs font-black uppercase tracking-widest text-primary">Ajuste / Margen (%)</Label>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="flex flex-col gap-1">
                      <Button variant="secondary" size="icon" className="h-6 w-8 rounded-md shadow-sm" onClick={() => adjustMargin(1)}><Plus className="w-3 h-3" /></Button>
                      <Button variant="secondary" size="icon" className="h-6 w-8 rounded-md shadow-sm" onClick={() => adjustMargin(-1)}><Minus className="w-3 h-3" /></Button>
                    </div>
                    <div className="relative flex-1">
                      <Percent className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/40" />
                      <Input 
                        type="number" 
                        value={marginPercent} 
                        onChange={e => handleMarginChange(e.target.value)}
                        className="h-14 rounded-xl font-black text-center text-primary bg-background pr-8 border-2 border-primary/10 shadow-inner"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground">Precio Venta ($)</Label>
                  <div className="flex flex-col gap-2">
                    <Input 
                      type="number" 
                      step="0.01" 
                      value={formData.precioVenta} 
                      onChange={e => handleSellPriceChange(e.target.value)} 
                      className="h-14 rounded-xl font-black text-primary bg-background border-2 border-primary/30 shadow-sm" 
                    />
                    
                    {projectedPrice > 0 && (
                      <div className="mt-2 p-4 rounded-2xl bg-white dark:bg-primary/10 border-2 border-primary/20 shadow-md animate-in zoom-in-95 duration-300">
                        <p className="text-[10px] text-primary font-black leading-tight uppercase tracking-widest mb-2 border-b border-primary/10 pb-1">
                          Proyección de Precio
                        </p>
                        <div className="space-y-1">
                          <p className="text-[11px] text-muted-foreground leading-snug">
                            Con un {Number(formData.precioCosto) > 0 ? 'margen' : 'ajuste'} del <span className="text-foreground font-black">{marginPercent}%</span>:
                          </p>
                          <p className="text-2xl font-black text-primary tracking-tighter">
                            ${projectedPrice.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                        </div>
                        
                        {Math.abs(projectedPrice - formData.precioVenta) > 0.01 && (
                          <Button 
                            size="sm" 
                            onClick={applyProjectedPrice} 
                            className="w-full mt-3 h-10 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-[10px] font-black uppercase tracking-widest gap-2 shadow-lg"
                          >
                            <CheckCircle2 className="w-4 h-4" /> Aplicar a Venta
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </ScrollArea>
          
          <div className="p-8 pt-4 shrink-0 bg-background border-t">
            <Button 
              onClick={handleSave} 
              disabled={!formData.name || (Number(formData.precioCosto) > 0 && formData.precioVenta <= formData.precioCosto)}
              className="w-full h-16 rounded-[1.5rem] text-xl font-bold shadow-2xl shadow-primary/30 uppercase tracking-widest disabled:opacity-50 disabled:grayscale"
            >
              {editingProduct ? 'Actualizar Producto' : 'Guardar Producto'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
