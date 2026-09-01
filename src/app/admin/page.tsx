"use client";

import { useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { ClientOnly } from '@/components/ClientOnly';
import { 
  Users, 
  ShieldAlert, 
  Lock, 
  Unlock, 
  History,
  Ban,
  ShieldCheck,
  Loader2,
  Clock,
  Crown,
  Plus
} from 'lucide-react';
import { useCollection, useFirestore, useMemoFirebase, useUser, useDoc } from '@/firebase';
import { collection, query, doc } from 'firebase/firestore';
import { UserProfile, CashSession } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useMarketStore } from '@/lib/store';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';

export default function AdminPanel() {
  return (
    <ClientOnly>
      <AppLayout>
        <AdminContent />
      </AppLayout>
    </ClientOnly>
  );
}

function AdminContent() {
  const db = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  const { toggleUserBlock, extendUserVip } = useMarketStore();

  const userProfileRef = useMemoFirebase(() => {
    if (!user) return null;
    return doc(db, 'users', user.uid);
  }, [db, user?.uid]);
  
  const { data: profile, isLoading: isProfileLoading } = useDoc<UserProfile>(userProfileRef);

  const usersQuery = useMemoFirebase(() => {
    if (profile?.role !== 'admin') return null;
    return query(collection(db, 'users'));
  }, [db, profile?.role]);

  const sessionsQuery = useMemoFirebase(() => {
    if (profile?.role !== 'admin') return null;
    return query(collection(db, 'shifts'));
  }, [db, profile?.role]);

  const { data: usersRaw, isLoading: usersLoading } = useCollection<UserProfile>(usersQuery);
  const { data: sessionsRaw, isLoading: sessionsLoading } = useCollection<CashSession>(sessionsQuery);

  const allUsers = useMemo(() => {
    const list = usersRaw || [];
    return [...list].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }, [usersRaw]);

  const allSessions = useMemo(() => {
    const list = sessionsRaw || [];
    return [...list].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  }, [sessionsRaw]);

  const handleExtendVip = async (userId: string, name: string) => {
    await extendUserVip(userId, 30);
    toast({ title: "VIP Extendido", description: `Se han sumado 30 días de membresía a ${name}.` });
  };

  if (isProfileLoading) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
        <p className="text-muted-foreground font-medium">Verificando credenciales maestras...</p>
      </div>
    );
  }

  if (profile?.role !== 'admin') {
    return (
      <div className="h-[70vh] flex flex-col items-center justify-center text-center">
        <ShieldAlert className="w-16 h-16 text-destructive mb-4" />
        <h1 className="text-3xl font-black">Acceso Denegado</h1>
        <p className="text-muted-foreground">Esta sección es exclusiva para el Super Administrador.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-4xl font-black text-foreground tracking-tight">Panel de Control Maestro</h1>
          <p className="text-muted-foreground mt-1 text-lg">Gestión centralizada de usuarios, accesos y sesiones cloud.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="rounded-2xl border-none bg-primary text-primary-foreground shadow-xl">
          <CardHeader className="pb-2">
            <CardDescription className="text-primary-foreground/70 font-bold">Total Usuarios</CardDescription>
            <CardTitle className="text-4xl font-black">{allUsers?.length || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="rounded-2xl border-none shadow-xl">
          <CardHeader className="pb-2">
            <CardDescription className="text-muted-foreground font-bold">Sesiones Totales</CardDescription>
            <CardTitle className="text-4xl font-black">{allSessions?.length || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="rounded-2xl border-none shadow-xl bg-destructive text-destructive-foreground">
          <CardHeader className="pb-2">
            <CardDescription className="text-destructive-foreground/70 font-bold">Cuentas Bloqueadas</CardDescription>
            <CardTitle className="text-4xl font-black">{allUsers?.filter(u => u.isBlocked).length || 0}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Tabs defaultValue="users" className="w-full">
        <TabsList className="bg-muted p-1 rounded-xl mb-6">
          <TabsTrigger value="users" className="rounded-lg gap-2"><Users className="w-4 h-4" /> Usuarios</TabsTrigger>
          <TabsTrigger value="sessions" className="rounded-lg gap-2"><History className="w-4 h-4" /> Todas las Sesiones</TabsTrigger>
        </TabsList>

        <TabsContent value="users">
          <Card className="rounded-3xl border-none shadow-xl overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow className="border-none">
                    <TableHead className="font-bold">Usuario</TableHead>
                    <TableHead className="font-bold">Email / Pass</TableHead>
                    <TableHead className="font-bold">VIP Hasta</TableHead>
                    <TableHead className="font-bold">Estado</TableHead>
                    <TableHead className="text-right font-bold">Acciones Maestras</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usersLoading ? (
                    <TableRow><TableCell colSpan={5} className="h-40 text-center">Cargando usuarios...</TableCell></TableRow>
                  ) : allUsers?.map((u) => (
                    <TableRow key={u.id} className={u.isBlocked ? "bg-destructive/5" : ""}>
                      <TableCell>
                        <p className="font-bold">{u.name || 'Sin nombre'}</p>
                        <Badge variant={u.role === 'admin' ? "default" : "secondary"} className="text-[9px] h-4">{u.role}</Badge>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm font-medium">{u.email}</p>
                        <p className="text-xs text-primary font-mono">{u.password || 'N/A'}</p>
                      </TableCell>
                      <TableCell>
                        {u.vipUntil && u.vipUntil > Date.now() ? (
                          <div className="flex flex-col">
                            <Badge className="bg-amber-500 gap-1 w-fit"><Crown className="w-3 h-3" /> VIP Activo</Badge>
                            <span className="text-[10px] text-muted-foreground mt-1">Vence: {format(u.vipUntil, 'dd/MM/yy')}</span>
                          </div>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">Gratuito</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {u.isBlocked ? (
                          <Badge variant="destructive" className="gap-1"><Ban className="w-3 h-3" /> Bloqueado</Badge>
                        ) : (
                          <Badge className="bg-emerald-500 gap-1"><ShieldCheck className="w-3 h-3" /> Activo</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="rounded-lg h-9 bg-amber-500/10 text-amber-600 border-amber-500/20 hover:bg-amber-500 hover:text-white"
                            onClick={() => handleExtendVip(u.uid, u.name)}
                          >
                            <Crown className="w-4 h-4 mr-2" /> +30 Días
                          </Button>
                          {u.role !== 'admin' && (
                            <Button 
                              variant={u.isBlocked ? "outline" : "destructive"} 
                              size="sm" 
                              className="rounded-lg h-9"
                              onClick={() => toggleUserBlock(u.uid, u.isBlocked)}
                            >
                              {u.isBlocked ? <Unlock className="w-4 h-4 mr-2" /> : <Ban className="w-4 h-4 mr-2" />}
                              {u.isBlocked ? 'Desbloquear' : 'Bloquear'}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="sessions">
          <Card className="rounded-3xl border-none shadow-xl overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow className="border-none">
                    <TableHead className="font-bold">Negocio / Cajero</TableHead>
                    <TableHead className="font-bold">Inicio</TableHead>
                    <TableHead className="font-bold">Ventas Totales</TableHead>
                    <TableHead className="font-bold">Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessionsLoading ? (
                    <TableRow><TableCell colSpan={4} className="h-40 text-center">Cargando sesiones...</TableCell></TableRow>
                  ) : allSessions?.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <p className="font-bold">{s.cashierName || 'Cajero desconocido'}</p>
                        <p className="text-xs text-muted-foreground">
                          ID: {s.userId ? `${String(s.userId).substring(0, 8)}...` : 'N/A'}
                        </p>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm">
                          {s.timestamp ? format(s.timestamp, 'dd/MM/yy HH:mm', { locale: es }) : 'N/A'}
                        </p>
                      </TableCell>
                      <TableCell>
                        <p className="font-black text-primary">${(s.totalSalesAmount || 0).toFixed(2)}</p>
                      </TableCell>
                      <TableCell>
                        {s.isClosed ? (
                          <Badge variant="secondary">Cerrado</Badge>
                        ) : (
                          <Badge className="bg-emerald-500 animate-pulse">Abierto</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
