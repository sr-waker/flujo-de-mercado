// Placeholder intencionalmente vacío / incompleto para TDD RED.
// La implementación real se añade en Step 4.
// Objetivo: validación barcode único y bidones enteros.
export function isBarcodeUnique(_codigo: string, _existing: string[]): boolean {
  // TODO: implementar - por ahora no valida unicidad (siempre true) para forzar RED
  return true;
}
export function normalizeQuantityForCategory(_category: string, qty: number): number {
  // TODO: Aceites debe ser entero; por ahora deja decimales para forzar RED
  return qty;
}
export function mermaAplicaParaCategoria(_category: string): boolean {
  // TODO: Aceites no aplica merma; por ahora dice que sí para forzar RED
  return true;
}
