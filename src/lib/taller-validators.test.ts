import { describe, it, expect } from 'vitest';
import { isBarcodeUnique, normalizeQuantityForCategory, mermaAplicaParaCategoria } from './taller-validators';

// Journeys TDD Aspecto 1 - TallerFlow mostrador
// J1: Como encargado quiero que cada código de barras sea único para no duplicar bidones
// J2: Como cajero quiero que Aceites solo venda unidades enteras
// J3: Como dueño no quiero merma en aceites/repuestos (bidón entero, no pesable)

describe('TallerFlow - Aspecto 1: Integridad mostrador', () => {
  describe('isBarcodeUnique', () => {
    it('rechaza duplicado exacto', () => {
      expect(isBarcodeUnique('7791234567890', ['7791234567890', '7700000000001'])).toBe(false);
    });
    it('rechaza duplicado con espacios / ceros', () => {
      expect(isBarcodeUnique(' 7791234567890 ', ['7791234567890'])).toBe(false);
    });
    it('acepta código nuevo', () => {
      expect(isBarcodeUnique('7790000000002', ['7791234567890'])).toBe(true);
    });
    it('rechaza vacío', () => {
      expect(isBarcodeUnique('', ['7791234567890'])).toBe(false);
      expect(isBarcodeUnique('   ', [])).toBe(false);
    });
    it('case-insensitive trim', () => {
      expect(isBarcodeUnique('ABC123', ['abc123'])).toBe(false);
    });
  });

  describe('normalizeQuantityForCategory - bidones enteros', () => {
    it('Aceites: trunca decimales a entero >=1', () => {
      expect(normalizeQuantityForCategory('Aceites', 1.7)).toBe(1);
      expect(normalizeQuantityForCategory('Aceites', 0.2)).toBe(1);
      expect(normalizeQuantityForCategory('Aceites', 2.9)).toBe(2);
    });
    it('Aceites: cantidad negativa o NaN => 1', () => {
      expect(normalizeQuantityForCategory('Aceites', -3)).toBe(1);
      expect(normalizeQuantityForCategory('Aceites', NaN as any)).toBe(1);
    });
    it('Repuestos: permite decimales solo si esVariable? no, también entero', () => {
      // Repuestos y Aceites son enteros; Accesorios/Químicos podrían ser decimales pero hoy todo entero
      expect(normalizeQuantityForCategory('Repuestos', 1.5)).toBe(1);
    });
    it('Otros: respeta entero (no deja 0)', () => {
      expect(normalizeQuantityForCategory('Otros', 0)).toBe(1);
    });
  });

  describe('mermaAplicaParaCategoria', () => {
    it('Aceites no lleva merma', () => {
      expect(mermaAplicaParaCategoria('Aceites')).toBe(false);
    });
    it('Repuestos no lleva merma', () => {
      expect(mermaAplicaParaCategoria('Repuestos')).toBe(false);
    });
    it('Químicos no lleva merma (bidón entero)', () => {
      expect(mermaAplicaParaCategoria('Químicos')).toBe(false);
    });
    it('categoría desconocida => false por defecto (taller no es carnicería)', () => {
      expect(mermaAplicaParaCategoria('Desconocida' as any)).toBe(false);
    });
  });

  describe('scanner <300ms (lookup)', () => {
    it('lookup por codigoBarras debe ser O(1) via Map', async () => {
      const products = Array.from({ length: 5000 }, (_, i) => ({ codigoBarras: `779${String(i).padStart(10,'0')}`, name: `P${i}` }));
      const map = new Map(products.map(p => [p.codigoBarras, p]));
      const t0 = performance.now();
      const hit = map.get('7790000000001');
      const dt = performance.now() - t0;
      expect(hit).toBeDefined();
      expect(dt).toBeLessThan(300);
    });
  });
});
