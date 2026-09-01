"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle } from 'lucide-react';

interface BotonCobrarProps {
  onConfirm: () => Promise<void>;
  disabled?: boolean;
}

/**
 * Componente BotonCobrar especializado para el POS.
 * Implementa el protocolo de estado isSubmitting y deshabilitación por error.
 */
export function BotonCobrar({ onConfirm, disabled }: BotonCobrarProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAction = async () => {
    setIsSubmitting(true);
    try {
      // Ejecutamos la función de cobro de Firebase/Store
      await onConfirm();
      // Si la venta es exitosa, el componente se desmontará o se limpiará desde el padre.
      // No reseteamos isSubmitting a menos que sea necesario para que permanezca bloqueado en éxito.
    } catch (error) {
      console.error("Fallo en la transacción cloud:", error);
      // Solo vuelve a habilitarse si hay un error en la función de Firebase
      setIsSubmitting(false);
    }
  };

  return (
    <Button 
      onClick={handleAction} 
      disabled={disabled || isSubmitting} 
      className="w-full h-14 rounded-2xl text-lg font-black uppercase shadow-xl transition-all active:scale-95"
    >
      {isSubmitting ? (
        <span className="flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin" />
          Procesando...
        </span>
      ) : (
        <span className="flex items-center gap-2">
          Confirmar Venta
        </span>
      )}
    </Button>
  );
}
