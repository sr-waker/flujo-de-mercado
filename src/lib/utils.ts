import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Formateador Universal de Moneda (es-AR)
 * Formatea números como moneda de Argentina: $ 1.234,56
 */
export function formatCurrency(value: number): string {
  if (value === undefined || value === null || isNaN(value)) return '$ 0,00';
  
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}
