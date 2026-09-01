
"use client";

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import Link from 'next/link';

/**
 * Página de Error de Next.js (Error Boundary)
 * Captura errores 503 o fallos de renderizado en el lado del servidor/cliente.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Logueamos el error para depuración técnica
    console.error("Error Crítico de MarketFlow:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-8 text-center animate-in fade-in zoom-in-95 duration-500">
        <div className="flex justify-center">
          <div className="w-24 h-24 bg-destructive/10 rounded-[2rem] flex items-center justify-center text-destructive">
            <AlertTriangle className="w-12 h-12" />
          </div>
        </div>
        
        <div className="space-y-2">
          <h1 className="text-3xl font-black tracking-tight">Saturación de Servidor</h1>
          <p className="text-muted-foreground font-medium leading-relaxed">
            El sistema está bajo alta demanda o hay un problema de conexión (Error 503/Cloud). Tus datos locales están a salvo.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3">
          <Button 
            onClick={() => reset()} 
            className="h-14 rounded-2xl bg-primary font-black uppercase text-lg shadow-xl shadow-primary/20 gap-3"
          >
            <RefreshCw className="w-5 h-5" /> Reintentar Conexión
          </Button>
          
          <Link href="/" passHref className="w-full">
            <Button variant="outline" className="w-full h-14 rounded-2xl border-2 font-bold text-muted-foreground">
              <Home className="w-5 h-5 mr-2" /> Volver al Inicio
            </Button>
          </Link>
        </div>

        <div className="pt-8 border-t border-border/50">
          <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">
            ID de Error: {error.digest || 'MF-CLOUD-UNAVAILABLE'}
          </p>
        </div>
      </div>
    </div>
  );
}
