import type { Category } from './types';

// Normaliza barcode: trim + lowercase (evita duplicados por espacios/case)
function normalizeBarcode(s: string): string {
  return (s ?? '').trim().toLowerCase();
}

export function isBarcodeUnique(codigo: string, existing: string[]): boolean {
  const norm = normalizeBarcode(codigo);
  if (!norm) return false; // vacío no es único
  const set = new Set(existing.map(normalizeBarcode).filter(Boolean));
  return !set.has(norm);
}

// TallerFlow: venta mostrador solo unidades enteras (bidones enteros).
// Para Aceites/Repuestos/etc siempre entero >=1. Si entra 1.7 => 1, 0.2 =>1, NaN =>1
export function normalizeQuantityForCategory(_category: string, qty: number): number {
  const n = Number(qty);
  if (!Number.isFinite(n) || n <= 0) return 1;
  const floored = Math.floor(n);
  return floored >= 1 ? floored : 1;
}

// TallerFlow: ninguna categoría de taller lleva merma (era lógica de carnicería).
// Se mantiene función para que POS/store no aplique porcentajeMerma.
export function mermaAplicaParaCategoria(_category: string): boolean {
  return false;
}

// Helper para lookup rápido por scanner (<300ms con Map)
export function buildBarcodeIndex<T extends { codigoBarras: string }>(products: T[]): Map<string, T> {
  return new Map(products.map(p => [normalizeBarcode(p.codigoBarras), p]));
}
export function lookupByBarcode<T extends { codigoBarras: string }>(index: Map<string, T>, codigo: string): T | undefined {
  return index.get(normalizeBarcode(codigo));
}
