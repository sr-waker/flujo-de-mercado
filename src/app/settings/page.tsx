
"use client";

import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { ClientOnly } from '@/components/ClientOnly';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { THEMES, applyTheme, getSavedTheme, ThemeId } from '@/lib/themes';
import { 
  Lock, 
  Save, 
  ShieldCheck, 
  Loader2, 
  Code2, 
  Terminal, 
  Crown, 
  Key, 
  RefreshCw,
  Copy,
  Clock,
  Download,
  FileArchive,
  Monitor,
  CheckCircle2,
  FileCode
} from 'lucide-react';
import { Palette, Wrench } from 'lucide-react';
import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { updatePassword } from 'firebase/auth';
import { doc } from 'firebase/firestore';
import { useMarketStore } from '@/lib/store';
import { UserProfile } from '@/lib/types';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

export default function SettingsPage() {
  return (
    <ClientOnly>
      <AppLayout>
        <SettingsContent />
      </AppLayout>
    </ClientOnly>
  );
}

function SettingsContent() {
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  const { grantAdminRole, generateVipKey, activateVipKey } = useMarketStore();
  
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isZipping, setIsZipping] = useState(false);

  // VIP section state
  const [vipInput, setVipInput] = useState('');
  const [isVipLoading, setIsVipLoading] = useState(false);
  const [lastGeneratedKey, setLastGeneratedKey] = useState('');

  const userProfileRef = useMemoFirebase(() => {
    if (!user) return null;
    return doc(db, 'users', user.uid);
  }, [db, user?.uid]);

  const { data: profile } = useDoc<UserProfile>(userProfileRef);

  const isVip = profile?.vipUntil && profile.vipUntil > Date.now();

  const [activeTheme, setActiveTheme] = useState<ThemeId>('industrial');
  useEffect(() => {
    setActiveTheme(getSavedTheme());
  }, []);
  const handleThemeChange = (id: ThemeId) => {
    applyTheme(id);
    setActiveTheme(id);
    toast({ title: "Paleta aplicada", description: THEMES.find(t=>t.id===id)?.name + " activada." });
  };

  const handleDownloadZip = async () => {
    setIsZipping(true);
    try {
      const zip = new JSZip();
      
      const instructions = `
MARKETFLOW - GUÍA DE EJECUCIÓN LOCAL
====================================

Este paquete contiene los archivos de configuración maestros necesarios para 
correr MarketFlow en tu computadora.

1. Requisitos:
   - Instalar Node.js 18 o superior.
   - Tener instalado VS Code.

2. Pasos para el despliegue:
   - Extrae este ZIP en una carpeta nueva.
   - Copia la carpeta "src" de tu repositorio actual de código a esta carpeta.
   - Abre una terminal y ejecuta: npm install
   - Configura las variables de entorno en un archivo .env.local con tus credenciales de Firebase.
   - Inicia el servidor de desarrollo con: npm run dev

3. Acceso:
   - Abre http://localhost:3000

IMPORTANTE: Los archivos de configuración (package.json, firebase.json, etc.) 
ya están incluidos en este paquete para garantizar que el entorno sea idéntico.
      `;

      // Contenidos de configuración (Archivos maestros del proyecto)
      const packageJson = `{
  "name": "marketflow-cloud",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "next": "15.5.9",
    "react": "^19.2.1",
    "react-dom": "^19.2.1",
    "firebase": "^11.9.1",
    "genkit": "^1.28.0",
    "lucide-react": "^0.475.0",
    "jszip": "^3.10.1",
    "file-saver": "^2.0.5",
    "tailwind-merge": "^3.0.1",
    "clsx": "^2.1.1"
  }
}`;

      const firebaseJson = `{
  "hosting": {
    "source": ".",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"]
  }
}`;

      const firestoreRules = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}`;

      const apphostingYaml = `runConfig:
  maxInstances: 1`;

      const nextConfig = `import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  reactStrictMode: true
};
export default nextConfig;`;

      // Armar el ZIP
      zip.file("README_LOCAL.txt", instructions);
      zip.file("package.json", packageJson);
      zip.file("firebase.json", firebaseJson);
      zip.file("firestore.rules", firestoreRules);
      zip.file("apphosting.yaml", apphostingYaml);
      zip.file("next.config.ts", nextConfig);
      zip.file(".gitignore", "node_modules\n.next\n.env.local\n.DS_Store");
      
      if (profile) {
        zip.file("BACKUP_DATA.json", JSON.stringify(profile, null, 2));
      }

      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, "MarketFlow_Project_Setup.zip");
      
      toast({ 
        title: "Paquete Generado", 
        description: "Se han incluido los archivos de configuración maestros (package.json, firebase.json, etc)." 
      });
    } catch (e) {
      toast({ title: "Error al generar ZIP", variant: "destructive" });
    } finally {
      setIsZipping(false);
    }
  };

  const handleActivateVip = async () => {
    if (!vipInput) return;
    setIsVipLoading(true);
    const result = await activateVipKey(vipInput);
    if (result.success) {
      toast({ title: "¡Operación Exitosa!", description: result.message });
      setVipInput('');
    } else {
      toast({ title: "Error VIP", description: result.message, variant: "destructive" });
    }
    setIsVipLoading(false);
  };

  const handleGenerateKey = async () => {
    const key = await generateVipKey();
    if (key) {
      setLastGeneratedKey(key);
      toast({ title: "Llave Generada", description: "Copia la llave y entrégala al usuario." });
    }
  };

  const handleSaveSettings = async () => {
    if (!user) return;
    if (newPassword !== confirmPassword) {
      toast({ title: "Error", description: "Las contraseñas no coinciden.", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    try {
      await updatePassword(user, newPassword);
      toast({ title: "Configuración Guardada", description: "Contraseña actualizada." });
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div>
        <h1 className="text-4xl font-black text-foreground tracking-tight">Configuración</h1>
        <p className="text-muted-foreground mt-1 text-lg">Administra tu acceso, privilegios VIP, apariencia y portabilidad.</p>
      </div>

      {/* PALETA TALLERFLOW */}
      <Card className="rounded-3xl border-none shadow-xl bg-card overflow-hidden xl:col-span-2">
        <CardHeader className="bg-muted/10 border-b pb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-primary rounded-2xl flex items-center justify-center">
              <Palette className="text-primary-foreground w-6 h-6" />
            </div>
            <div>
              <CardTitle className="text-2xl flex items-center gap-2"><Wrench className="w-5 h-5 text-primary" /> Paleta TallerFlow</CardTitle>
              <CardDescription>Elegí los colores de tu taller. Se aplica al instante y queda guardado.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
            {THEMES.map(theme => {
              const isActive = activeTheme === theme.id;
              return (
                <button
                  key={theme.id}
                  onClick={() => handleThemeChange(theme.id)}
                  className={`text-left rounded-2xl border-2 p-4 transition-all hover:scale-[1.02] ${isActive ? 'border-primary shadow-lg bg-primary/5' : 'border-border hover:border-primary/40 bg-card'}`}
                >
                  <div className="flex gap-2 mb-3">
                    <span className="w-8 h-8 rounded-full border shadow-sm" style={{ background: theme.colors.primary }} />
                    <span className="w-8 h-8 rounded-full border shadow-sm" style={{ background: theme.colors.accent }} />
                    <span className="w-8 h-8 rounded-full border shadow-sm" style={{ background: theme.colors.bg }} />
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="font-black text-sm">{theme.name}</p>
                    {theme.badge && <span className="text-[9px] font-black uppercase bg-primary text-primary-foreground px-2 py-0.5 rounded-full">{theme.badge}</span>}
                    {isActive && <CheckCircle2 className="w-4 h-4 text-primary ml-auto" />}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{theme.description}</p>
                </button>
              );
            })}
          </div>
          <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mt-4">Tip: Para taller mecánico, Taller Industrial y Acero & Aceite tienen mejor contraste con grasa/polvo.</p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 items-start">
        {/* VIP ACCESS CARD */}
        <Card className="rounded-3xl border-none shadow-xl bg-card overflow-hidden h-full border-t-4 border-primary">
          <CardHeader className="bg-primary/5 border-b pb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center">
                <Crown className="text-primary w-6 h-6" />
              </div>
              <div>
                <CardTitle className="text-2xl">Membresía VIP</CardTitle>
                <CardDescription>Activa o extiende funciones exclusivas.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-8 space-y-8">
            {isVip && (
              <div className="bg-primary/10 p-6 rounded-2xl border border-primary/20 space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-primary rounded-full flex items-center justify-center text-white">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="font-black text-primary text-xl uppercase tracking-widest">Estado: VIP ACTIVO</p>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" /> 
                      Vence en {formatDistanceToNow(profile?.vipUntil!, { locale: es })}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="vip-key" className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">
                  {isVip ? "Extender Membresía" : "Ingresar Llave VIP"}
                </Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                    <Input 
                      id="vip-key"
                      placeholder="XXXX-XXXX-XXXX"
                      className="rounded-xl h-14 pl-12 bg-muted/30 border-none font-black text-lg tracking-widest uppercase"
                      value={vipInput}
                      onChange={(e) => setVipInput(e.target.value)}
                    />
                  </div>
                  <Button onClick={handleActivateVip} disabled={isVipLoading || !vipInput} className="h-14 px-8 rounded-xl font-bold bg-primary shadow-lg">
                    {isVipLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : (isVip ? "Sumar +30 Días" : "Activar")}
                  </Button>
                </div>
              </div>
            </div>

            {profile?.role === 'admin' && (
              <div className="pt-8 border-t border-border/50 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-black text-sm text-primary uppercase flex items-center gap-2">
                    <Terminal className="w-4 h-4" /> Generador Maestro (Admin)
                  </h4>
                  <Button variant="ghost" size="sm" onClick={handleGenerateKey} className="text-xs gap-2 hover:bg-primary/5 hover:text-primary">
                    <RefreshCw className="w-3 h-3" /> Nueva Llave
                  </Button>
                </div>
                {lastGeneratedKey && (
                  <div className="bg-muted p-4 rounded-xl flex items-center justify-between border border-primary/20 animate-in zoom-in-95 shadow-inner">
                    <code className="font-black text-lg text-primary tracking-widest">{lastGeneratedKey}</code>
                    <Button variant="ghost" size="icon" onClick={() => {
                      navigator.clipboard.writeText(lastGeneratedKey);
                      toast({ title: "Copiado", description: "Llave lista para compartir." });
                    }}>
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* PORTABILITY CARD */}
        <Card className="rounded-3xl border-none shadow-xl bg-card overflow-hidden h-full">
          <CardHeader className="bg-amber-500/10 border-b pb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-amber-500/10 rounded-2xl flex items-center justify-center">
                <Monitor className="text-amber-600 w-6 h-6" />
              </div>
              <div>
                <CardTitle className="text-2xl text-amber-600">Portabilidad Local</CardTitle>
                <CardDescription>Exporta los archivos maestros para correr en tu PC.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-8 space-y-6">
            <div className="bg-muted/30 p-5 rounded-2xl space-y-4">
              <p className="text-sm font-medium leading-relaxed">
                Este paquete incluye todos los archivos de configuración requeridos para recrear el entorno de MarketFlow localmente.
              </p>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-[11px] font-bold text-muted-foreground">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Configuración: package.json, next.config, tailwind.
                </div>
                <div className="flex items-center gap-2 text-[11px] font-bold text-muted-foreground">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Firebase: Configuración de hosting y reglas DB.
                </div>
                <div className="flex items-center gap-2 text-[11px] font-bold text-muted-foreground">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Datos: Respaldo de tu perfil de usuario actual.
                </div>
              </div>
            </div>

            <Button 
              onClick={handleDownloadZip} 
              disabled={isZipping}
              className="w-full h-16 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white font-black uppercase text-lg shadow-xl shadow-amber-600/20 gap-3"
            >
              {isZipping ? <Loader2 className="w-6 h-6 animate-spin" /> : <FileArchive className="w-6 h-6" />}
              {isZipping ? 'Comprimiendo Archivos...' : 'Descargar Archivos Maestros'}
            </Button>
            
            <p className="text-[10px] text-center text-muted-foreground font-bold uppercase tracking-widest leading-relaxed">
              Recuerda copiar tu carpeta <strong>/src</strong> del repositorio original para completar el proyecto local.
            </p>
          </CardContent>
        </Card>

        {/* SECURITY CARD */}
        <Card className="rounded-3xl border-none shadow-xl bg-card overflow-hidden h-full xl:col-span-2">
          <CardHeader className="bg-muted/10 border-b pb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-muted rounded-2xl flex items-center justify-center">
                <Lock className="text-muted-foreground w-6 h-6" />
              </div>
              <div>
                <CardTitle className="text-2xl">Seguridad</CardTitle>
                <CardDescription>Gestión de credenciales del sistema.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-8 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="new-password">Nueva Contraseña</Label>
                <Input 
                  id="new-password"
                  type="password"
                  className="rounded-xl h-12 bg-muted/30 border-none"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirmar Contraseña</Label>
                <Input 
                  id="confirm-password"
                  type="password"
                  className="rounded-xl h-12 bg-muted/30 border-none"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
            </div>
            <Button onClick={handleSaveSettings} disabled={isLoading || !newPassword} className="w-full rounded-xl h-14 font-bold shadow-lg">
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              Guardar Nueva Contraseña
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
