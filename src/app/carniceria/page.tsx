"use client";

import { useMemo, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { ClientOnly } from '@/components/ClientOnly';
import { 
  Beef, 
  Plus, 
  Trash2, 
  Folder, 
  ChevronRight, 
  Loader2, 
  FolderPlus,
  Info,
  Calendar,
  Receipt,
  Clock,
  CheckCircle2
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { useCollection, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import { MeatFolder, Sale } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';

export default function CarniceriaPage() {
  return (
    <ClientOnly>
      <AppLayout>
        <CarniceriaContent />
      </AppLayout>
    </ClientOnly>
  );
}

function CarniceriaContent() {
  const db = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  const { addMeatFolder, deleteMeatFolder } = useMarketStore();
  
  const [isNewFolderModalOpen, setIsNewFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [selectedFolder, setSelectedFolder] = useState<MeatFolder | null>(null);

  const foldersQuery = useMemoFirebase(() => {
    if (!user || !db) return null;
    return query(collection(db, 'meat_folders'), where('userId', '==', user.uid));
  }, [db, user?.uid]);

  const salesQuery = useMemoFirebase(() => {
    if (!user || !db) return null;
    return query(collection(db, 'sales'), where('userId', '==', user.uid));
  }, [db, user?.uid]);

  const { data: folders, isLoading } = useCollection<MeatFolder>(foldersQuery);
  const { data: allSales } = useCollection<Sale>(salesQuery);

  const folderStats = useMemo(() => {
    const stats: Record<string, { total: number; count: number; transactions: Sale[] }> = {};
    if (!allSales) return stats;
    allSales.forEach(sale => {
      sale.extraCharges?.forEach(charge => {
        if (charge.isBalanza && charge.meatFolderId) {
          const folderId = charge.meatFolderId;
          if (!stats[folderId]) stats[folderId] = { total: 0, count: 0, transactions: [] };
          stats[folderId].total += (charge.amount || 0);
          stats[folderId].count += 1;
          if (!stats[folderId].transactions.find(t => t.id === sale.id)) {
            stats[folderId].transactions.push(sale);
          }
        }
      });
    });
    return stats;
  }, [allSales]);

  const handleCreateFolder = () => {
    if (!newFolderName.trim()) return;
    addMeatFolder(newFolderName.trim());
    setNewFolderName('');
    setIsNewFolderModalOpen(false);
    toast({ title: "Carpeta creada", description: `Categoría "${newFolderName}" lista para usar.` });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-4xl font-black text-foreground tracking-tight">Carnicería Cloud</h1>
          <p className="text-muted-foreground mt-1">Organiza y totaliza tus ventas por tipo de carne.</p>
        </div>
        <Button onClick={() => setIsNewFolderModalOpen(true)} className="h-16 px-8 rounded-2xl bg-primary font-bold gap-2">
          <FolderPlus className="w-6 h-6" /> Nueva Carpeta
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {isLoading ? (
          <div className="col-span-full h-40 flex items-center justify-center">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
          </div>
        ) : folders && folders.length > 0 ? (
          folders.map((folder) => {
            const stats = folderStats[folder.id] || { total: 0, count: 0 };
            return (
              <Card 
                key={folder.id} 
                className="rounded-3xl border-none shadow-xl bg-card hover:bg-muted/50 p-6 space-y-4 cursor-pointer transition-all active:scale-95 group" 
                onClick={() => setSelectedFolder(folder)}
              >
                <div className="flex justify-between items-start">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-colors">
                    <Beef className="w-6 h-6" />
                  </div>
                  {stats.total > 0 && (
                    <Badge variant="default" className="bg-emerald-500 rounded-lg font-black text-xs px-2 border-none">
                      ${stats.total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                    </Badge>
                  )}
                </div>
                <h3 className="text-xl font-black truncate">{folder.name}</h3>
                <p className="text-[10px] font-bold uppercase text-muted-foreground">{stats.count} Ventas Registradas</p>
              </Card>
            );
          })
        ) : (
          <div className="col-span-full py-20 text-center opacity-30 flex flex-col items-center">
            <Folder className="w-20 h-20 mb-4" />
            <p className="text-xl font-black uppercase">No tienes carpetas de balanza</p>
          </div>
        )}
      </div>

      {/* MODAL NUEVA CARPETA */}
      <Dialog open={isNewFolderModalOpen} onOpenChange={setIsNewFolderModalOpen}>
        <DialogContent className="max-w-md rounded-[2rem] border-none shadow-2xl p-0 overflow-hidden">
          <div className="bg-primary p-6 text-white text-center">
            <DialogTitle className="text-2xl font-black">Nueva Carpeta</DialogTitle>
            <p className="text-white/80 font-bold mt-1 uppercase text-[10px] tracking-widest">Organización de Balanza</p>
          </div>
          <div className="p-8 space-y-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase text-muted-foreground">Nombre de la Carpeta</Label>
              <Input 
                placeholder="Ej: Carne de Vaca, Pollo, Cerdo..." 
                value={newFolderName} 
                onChange={e => setNewFolderName(e.target.value)}
                className="h-14 rounded-2xl bg-muted/30 border-none text-lg font-bold"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
              />
            </div>
          </div>
          <DialogFooter className="p-8 pt-0">
            <Button onClick={handleCreateFolder} disabled={!newFolderName.trim()} className="w-full h-14 rounded-2xl text-lg font-black uppercase shadow-xl">
              Crear Carpeta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL DETALLE DE CARPETA (ACUMULADOS) */}
      <Dialog open={!!selectedFolder} onOpenChange={(open) => !open && setSelectedFolder(null)}>
        <DialogContent className="max-w-2xl rounded-[2.5rem] border-none shadow-2xl p-0 overflow-hidden h-[85vh] flex flex-col">
          {selectedFolder ? (
            <>
              <div className="p-8 bg-primary text-white shrink-0 relative overflow-hidden">
                <div className="relative z-10">
                  <DialogHeader>
                    <DialogTitle className="text-3xl font-black">{selectedFolder.name}</DialogTitle>
                    <p className="text-white/80 font-bold mt-1">Acumulado Histórico: ${ (folderStats[selectedFolder.id]?.total || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 }) }</p>
                  </DialogHeader>
                </div>
                <div className="absolute -right-10 -bottom-10 opacity-10 pointer-events-none">
                  <Beef className="w-48 h-48" />
                </div>
              </div>
              
              <ScrollArea className="flex-1 p-6">
                <div className="space-y-3">
                  {folderStats[selectedFolder.id]?.transactions && folderStats[selectedFolder.id].transactions.length > 0 ? (
                    folderStats[selectedFolder.id].transactions.sort((a,b) => b.timestamp - a.timestamp).map(sale => (
                      <div key={sale.id} className="p-4 rounded-xl bg-muted/40 flex justify-between items-center hover:bg-muted/60 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                            <Clock className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="text-xs font-black">Ticket #{sale.id.slice(-4).toUpperCase()}</p>
                            <p className="text-[10px] text-muted-foreground font-medium">{format(sale.timestamp, 'dd/MM/yy HH:mm', { locale: es })}</p>
                          </div>
                        </div>
                        <p className="text-xl font-black text-primary">
                          ${ (sale.extraCharges?.filter(c => c.meatFolderId === selectedFolder.id).reduce((a,b) => a + b.amount, 0) || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 }) }
                        </p>
                      </div>
                    ))
                  ) : (
                    <div className="h-60 flex flex-col items-center justify-center text-muted-foreground opacity-30">
                      <Receipt className="w-12 h-12 mb-2" />
                      <p className="font-bold">No hay ventas registradas aún</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
              
              <div className="p-6 bg-muted/30 border-t flex gap-4 shrink-0">
                <Button variant="outline" className="flex-1 h-12 font-bold text-destructive border-destructive/20 hover:bg-destructive/10" onClick={() => { if(confirm(`¿Borrar carpeta "${selectedFolder.name}" permanentemente?`)) { deleteMeatFolder(selectedFolder.id); setSelectedFolder(null); } }}>
                  <Trash2 className="w-4 h-4 mr-2" /> Borrar Carpeta
                </Button>
                <Button variant="secondary" className="flex-1 h-12 font-bold" onClick={() => setSelectedFolder(null)}>Cerrar</Button>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
