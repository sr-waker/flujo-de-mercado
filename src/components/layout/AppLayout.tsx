
"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { 
  LayoutDashboard, 
  ShoppingCart, 
  Package, 
  Truck, 
  BarChart3, 
  User, 
  LogOut, 
  Store,
  Settings,
  Lock,
  Loader2,
  History,
  Menu,
  ShieldAlert,
  ShieldCheck,
  UserCircle,
  Mail,
  Crown,
  UserPlus,
  Wrench
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { 
  Sheet, 
  SheetContent, 
  SheetTrigger,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet';
import { useMarketStore } from '@/lib/store';
import { useUser, useAuth, useCollection, useFirestore, useMemoFirebase, useDoc, errorEmitter, initiateAnonymousSignIn } from '@/firebase';
import { collection, query, where, limit, doc } from 'firebase/firestore';
import { createUserWithEmailAndPassword, updateProfile, signInWithEmailAndPassword } from 'firebase/auth';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { UserProfile } from '@/lib/types';
import { Badge } from '@/components/ui/badge';

const navItems = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard, vipOnly: false },
  { name: 'Caja (POS)', href: '/pos', icon: ShoppingCart, vipOnly: false },
  { name: 'Inventario', href: '/inventory', icon: Package, vipOnly: false },
  { name: 'Taller', href: '/carniceria', icon: Wrench, vipOnly: false },
  { name: 'Fiados', href: '/fiados', icon: UserPlus, vipOnly: false },
  { name: 'Compras', href: '/purchases', icon: Truck, vipOnly: true },
  { name: 'Reportes', href: '/reports', icon: BarChart3, vipOnly: true },
  { name: 'Historial', href: '/history', icon: History, vipOnly: true },
  { name: 'Panel Admin', href: '/admin', icon: ShieldCheck, adminOnly: true },
  { name: 'Configuración', href: '/settings', icon: Settings, vipOnly: false },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, isUserLoading } = useUser();
  const { toast } = useToast();
  const auth = useAuth();
  const db = useFirestore();
  
  const userProfileRef = useMemoFirebase(() => {
    if (!user) return null;
    return doc(db, 'users', user.uid);
  }, [db, user?.uid]);
  
  const { data: profile, isLoading: isProfileLoading } = useDoc<UserProfile>(userProfileRef);

  const sessionsQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(
      collection(db, 'shifts'), 
      where('userId', '==', user.uid), 
      where('isClosed', '==', false),
      limit(1)
    );
  }, [db, user?.uid]);
  
  const { data: activeSessions } = useCollection<any>(sessionsQuery);
  const activeSession = activeSessions?.[0];

  const { startSession, closeSession } = useMarketStore();
  
  const [isOpeningSession, setIsOpeningSession] = useState(false);
  const [initialBalance, setInitialBalance] = useState('0');
  
  const [nameInput, setNameInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const isVip = profile?.vipUntil && profile.vipUntil > Date.now();
  const isAdmin = profile?.role === 'admin';
  const hasVipAccess = isAdmin || isVip;

  useEffect(() => {
    const handleError = (error: any) => {
      setIsSubmitting(false);
      let message = error.message;
      if (error.code === 'auth/invalid-credential') message = "Credenciales incorrectas.";
      if (error.code === 'auth/user-not-found') message = "El usuario no existe.";
      if (error.code === 'auth/email-already-in-use') message = "Este correo ya está registrado.";
      
      toast({ title: "Error de Acceso", description: message, variant: "destructive" });
    };
    errorEmitter.on('auth-error', handleError);
    return () => errorEmitter.off('auth-error', handleError);
  }, [toast]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isRegistering && !nameInput) {
      toast({ title: "Nombre Requerido", description: "Por favor, ingresa tu nombre de usuario.", variant: "destructive" });
      return;
    }
    if (!passwordInput) return;
    
    setIsSubmitting(true);

    let finalEmail = emailInput.trim();
    if (!finalEmail || !finalEmail.includes('@')) {
      const username = finalEmail || nameInput || 'usuario';
      finalEmail = `${username.toLowerCase().replace(/\s+/g, '')}@tallerflow.local`;
    }

    try {
      if (isRegistering) {
        const userCredential = await createUserWithEmailAndPassword(auth, finalEmail, passwordInput);
        await updateProfile(userCredential.user, { displayName: nameInput });
        
        const profileData: Omit<UserProfile, 'id'> = {
          uid: userCredential.user.uid,
          name: nameInput,
          email: finalEmail.includes('@tallerflow.local') ? '' : finalEmail,
          password: passwordInput,
          role: 'user',
          isBlocked: false,
          createdAt: Date.now()
        };
        
        setDocumentNonBlocking(doc(db, 'users', userCredential.user.uid), profileData, { merge: true });
        toast({ title: "¡Bienvenido!", description: `Cuenta creada exitosamente para ${nameInput}.` });
      } else {
        await signInWithEmailAndPassword(auth, finalEmail, passwordInput);
      }
    } catch (error: any) {
      errorEmitter.emit('auth-error', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartSession = () => {
    startSession(parseFloat(initialBalance) || 0);
    setIsOpeningSession(false);
    setInitialBalance('0');
  };

  if (isUserLoading || (user && isProfileLoading)) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4 bg-background">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
        <p className="text-muted-foreground font-medium">Iniciando TallerFlow Cloud...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-card rounded-[2.5rem] shadow-2xl overflow-hidden border border-border/50">
          <div className="bg-primary p-10 flex flex-col items-center gap-6 relative">
            <div className="w-20 h-20 bg-white/20 rounded-3xl flex items-center justify-center backdrop-blur-md">
              <Store className="text-white w-10 h-10" />
            </div>
            <div className="text-center">
              <h1 className="text-3xl font-black text-white tracking-tight">TallerFlow</h1>
              <p className="text-primary-foreground/90 font-medium mt-1">
                {isRegistering ? 'Registro de Negocio' : 'Acceso al Sistema'}
              </p>
            </div>
          </div>
          
          <div className="p-8 space-y-6">
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div className="space-y-3">
                {isRegistering && (
                  <div className="relative">
                    <UserCircle className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                    <Input 
                      placeholder="Tu Nombre o Negocio" 
                      className="pl-12 h-14 rounded-2xl bg-muted/30 border-none font-bold" 
                      value={nameInput} 
                      onChange={(e) => setNameInput(e.target.value)} 
                      disabled={isSubmitting} 
                    />
                  </div>
                )}
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input 
                    type="text" 
                    placeholder={isRegistering ? "Usuario o Email (Opcional)" : "Usuario o Email"} 
                    className="pl-12 h-14 rounded-2xl bg-muted/30 border-none font-medium" 
                    value={emailInput} 
                    onChange={(e) => setEmailInput(e.target.value)} 
                    disabled={isSubmitting} 
                  />
                </div>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input 
                    type="password" 
                    placeholder="Contraseña" 
                    className="pl-12 h-14 rounded-2xl bg-muted/30 border-none font-medium" 
                    value={passwordInput} 
                    onChange={(e) => setPasswordInput(e.target.value)} 
                    disabled={isSubmitting} 
                  />
                </div>
              </div>
              <Button type="submit" className="w-full h-14 rounded-2xl text-lg font-bold shadow-xl shadow-primary/20" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : (isRegistering ? 'Crear mi Cuenta' : 'Entrar')}
              </Button>
            </form>

            <div className="text-center">
              <button 
                type="button" 
                onClick={() => setIsRegistering(!isRegistering)}
                className="text-sm font-bold text-primary hover:underline"
              >
                {isRegistering ? '¿Ya tienes cuenta? Inicia sesión' : '¿No tienes cuenta? Regístrate aquí'}
              </button>
            </div>

            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-muted"></span></div>
              <div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-2 text-muted-foreground">O también</span></div>
            </div>
            {process.env.NEXT_PUBLIC_ENABLE_DEMO === 'true' ? (
              <Button variant="outline" onClick={() => initiateAnonymousSignIn(auth)} className="w-full h-14 rounded-2xl border-2 border-primary/20 text-primary font-bold">Modo Prueba Sin Cuenta</Button>
            ) : (
              <p className="text-xs text-center text-muted-foreground py-2 border border-dashed rounded-2xl">Modo prueba deshabilitado — ingresá con tu cuenta.</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-card">
      <div className="p-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
            <Store className="text-primary-foreground w-6 h-6" />
          </div>
          <span className="text-xl font-bold tracking-tight text-primary">TallerFlow</span>
        </div>
        {isVip && (
          <div className="w-8 h-8 bg-amber-500 rounded-full flex items-center justify-center shadow-lg animate-pulse">
            <Crown className="w-5 h-5 text-white" />
          </div>
        )}
      </div>

      <nav className="flex-1 px-4 py-4 space-y-1">
        {navItems.filter(item => !item.adminOnly || isAdmin).map((item) => {
          const isActive = pathname === item.href;
          const isRestricted = item.vipOnly && !hasVipAccess;

          return (
            <Link
              key={item.name}
              href={isRestricted ? pathname : item.href}
              onClick={(e) => {
                if (isRestricted) {
                  e.preventDefault();
                  toast({ 
                    title: "Acceso VIP Requerido", 
                    description: "Esta sección es exclusiva para miembros VIP.", 
                    variant: "destructive" 
                  });
                } else {
                  setIsMobileMenuOpen(false);
                }
              }}
              className={cn(
                "flex items-center justify-between px-4 py-3 rounded-xl transition-all",
                isActive ? "bg-primary text-primary-foreground shadow-md" : "text-muted-foreground hover:bg-muted",
                isRestricted && "opacity-60 grayscale cursor-not-allowed"
              )}
            >
              <div className="flex items-center gap-3">
                <item.icon className="w-5 h-5" />
                <span className="font-medium">{item.name}</span>
              </div>
              {isRestricted && <Lock className="w-4 h-4 text-muted-foreground" />}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="w-full justify-start gap-3 h-14 rounded-xl hover:bg-muted">
              <div className={cn("w-8 h-8 rounded-full flex items-center justify-center", isAdmin ? "bg-amber-500" : "bg-primary")}>
                {isAdmin ? <ShieldAlert className="w-5 h-5 text-white" /> : <User className="w-5 h-5 text-white" />}
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold truncate max-w-[120px]">
                  {profile?.name || user.displayName || 'Usuario'}
                </p>
                <p className="text-xs text-muted-foreground">{isVip ? 'Miembro VIP' : 'Cuenta Gratuita'}</p>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 rounded-xl p-2">
            <DropdownMenuLabel>Caja Cloud</DropdownMenuLabel>
            {!activeSession ? (
              <DropdownMenuItem onClick={() => setIsOpeningSession(true)}>Abrir Caja</DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => closeSession(activeSession.id, activeSession.totalSalesAmount, 0, activeSession.initialBalance)}>Cerrar Caja</DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => auth.signOut()}>Cerrar Sesión</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <aside className="hidden lg:flex w-64 flex-col border-r bg-card shadow-xl z-20"><SidebarContent /></aside>
      <main className="flex-1 overflow-auto relative">
        <div className="lg:hidden flex items-center justify-between p-4 bg-card border-b sticky top-0 z-30">
          <div className="flex items-center gap-3">
             <Store className="text-primary w-6 h-6" /><span className="text-lg font-bold text-primary">TallerFlow</span>
          </div>
          <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
            <SheetTrigger asChild><Button variant="ghost" size="icon"><Menu className="w-6 h-6" /></Button></SheetTrigger>
            <SheetContent side="left" className="p-0 w-72">
              <SheetHeader className="sr-only"><SheetTitle>Navegación</SheetTitle></SheetHeader>
              <SidebarContent />
            </SheetContent>
          </Sheet>
        </div>
        <div className="p-4 md:p-8 w-full max-w-[98%] mx-auto">{children}</div>
      </main>

      <Dialog open={isOpeningSession} onOpenChange={setIsOpeningSession}>
        <DialogContent className="rounded-2xl">
          <DialogHeader><DialogTitle>Abrir Caja Cloud</DialogTitle></DialogHeader>
          <div className="py-4 space-y-4">
            <Label>Saldo Inicial ($)</Label>
            <Input type="number" value={initialBalance} onChange={(e) => setInitialBalance(e.target.value)} className="h-12" />
          </div>
          <DialogFooter><Button onClick={handleStartSession}>Abrir Caja</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
