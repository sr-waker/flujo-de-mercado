import { describe, it, expect } from 'vitest';
import {
  ALLOWED_TAX_RATES,
  CATEGORIA_IVA_DEFAUT,
  normalizeCuit,
  formatCuit,
  isValidCuit,
  isValidTaxRate,
  getIvaRateForCategory,
  calcLineFiscal,
  calcReceiptFiscal,
  getCbteTipo,
  buildAfipPayload,
  AFIP_TAX_ID_MAP,
} from './taller-fiscal';

// Jornada fiscal AFIP — TallerFlow mostrador
// IVA 21 / 10.5 / 27, CUIT/condición IVA, cola CAE WSFE idempotente

describe('TallerFlow - Tarea 3 Fiscal AFIP', () => {
  describe('CUIT', () => {
    it('normalizeCuit quita guiones y espacios', () => {
      expect(normalizeCuit('20-12345678-6')).toBe('20123456786');
      expect(normalizeCuit(' 20 12345678 6 ')).toBe('20123456786');
    });
    it('isValidCuit acepta CUIT válido 20-12345678-6', () => {
      expect(isValidCuit('20-12345678-6')).toBe(true);
      expect(isValidCuit('20123456786')).toBe(true);
    });
    it('isValidCuit rechaza dígito verificador malo', () => {
      expect(isValidCuit('20-12345678-9')).toBe(false);
    });
    it('isValidCuit rechaza longitud incorrecta', () => {
      expect(isValidCuit('20-1234567-6')).toBe(false);
      expect(isValidCuit('')).toBe(false);
    });
    it('formatCuit formatea XX-XXXXXXXX-X', () => {
      expect(formatCuit('20123456786')).toBe('20-12345678-6');
      expect(formatCuit('20-12345678-6')).toBe('20-12345678-6');
    });
    it('isValidCuit acepta 27-12345678-0 variante prefijo 27', () => {
      expect(isValidCuit('27-12345678-0')).toBe(true);
    });
  });

  describe('IVA por categoría', () => {
    it('ALLOWED_TAX_RATES contiene 0.105 0.21 0.27 y 0', () => {
      expect(ALLOWED_TAX_RATES).toEqual(expect.arrayContaining([0, 0.105, 0.21, 0.27]));
    });
    it('CATEGORIA_IVA_DEFAUT todas categorías 0.21 por defecto', () => {
      expect(CATEGORIA_IVA_DEFAUT['Repuestos']).toBe(0.21);
      expect(CATEGORIA_IVA_DEFAUT['Aceites']).toBe(0.21);
      expect(CATEGORIA_IVA_DEFAUT['Otros']).toBe(0.21);
    });
    it('getIvaRateForCategory devuelve override válido', () => {
      expect(getIvaRateForCategory('Repuestos', 0.105)).toBe(0.105);
      expect(getIvaRateForCategory('Aceites', 0.27)).toBe(0.27);
    });
    it('getIvaRateForCategory ignora override inválido y usa default', () => {
      expect(getIvaRateForCategory('Repuestos', 0.19 as any)).toBe(0.21);
      expect(getIvaRateForCategory('Repuestos')).toBe(0.21);
    });
    it('isValidTaxRate valida solo 0/10.5/21/27', () => {
      expect(isValidTaxRate(0.21)).toBe(true);
      expect(isValidTaxRate(0.105)).toBe(true);
      expect(isValidTaxRate(0.27)).toBe(true);
      expect(isValidTaxRate(0)).toBe(true);
      expect(isValidTaxRate(0.19)).toBe(false);
    });
    it('AFIP_TAX_ID_MAP mapea 0.21→5 0.105→4 0.27→6 0→3', () => {
      expect(AFIP_TAX_ID_MAP[0.21]).toBe(5);
      expect(AFIP_TAX_ID_MAP[0.105]).toBe(4);
      expect(AFIP_TAX_ID_MAP[0.27]).toBe(6);
      expect(AFIP_TAX_ID_MAP[0]).toBe(3);
    });
  });

  describe('Cálculo fiscal líneas (IVA discriminado)', () => {
    it('calcLineFiscal IVA incluido: 121 con 21% → neto 100 iva 21', () => {
      const r = calcLineFiscal({ quantity: 1, unitPriceIncl: 121, taxRate: 0.21 });
      expect(r.neto).toBe(100);
      expect(r.iva).toBe(21);
      expect(r.total).toBe(121);
    });
    it('calcLineFiscal IVA incluido con cantidad 2', () => {
      const r = calcLineFiscal({ quantity: 2, unitPriceIncl: 121, taxRate: 0.21 });
      expect(r.neto).toBe(200);
      expect(r.iva).toBe(42);
      expect(r.total).toBe(242);
    });
    it('calcLineFiscal IVA 10.5% incluido 110.5 → neto 100', () => {
      const r = calcLineFiscal({ quantity: 1, unitPriceIncl: 110.5, taxRate: 0.105 });
      expect(r.neto).toBe(100);
      expect(r.iva).toBe(10.5);
    });
    it('calcLineFiscal modo excluido: neto 100 +21% → total 121', () => {
      const r = calcLineFiscal({ quantity: 1, unitPriceIncl: 100, taxRate: 0.21, ivaIncluido: false });
      expect(r.neto).toBe(100);
      expect(r.iva).toBe(21);
      expect(r.total).toBe(121);
    });
    it('calcLineFiscal 27% incluido 127 → neto 100', () => {
      const r = calcLineFiscal({ quantity: 1, unitPriceIncl: 127, taxRate: 0.27 });
      expect(r.neto).toBe(100);
      expect(r.iva).toBe(27);
    });
  });

  describe('calcReceiptFiscal agrupado por alícuota', () => {
    it('agrupa IVA por tasa y suma totales', () => {
      const r = calcReceiptFiscal([
        { quantity: 1, unitPriceIncl: 121, taxRate: 0.21 },
        { quantity: 1, unitPriceIncl: 110.5, taxRate: 0.105 },
        { quantity: 2, unitPriceIncl: 121, taxRate: 0.21 },
      ]);
      expect(r.total).toBeCloseTo(121 + 110.5 + 242);
      expect(r.neto).toBeCloseTo(100 + 100 + 200);
      expect(r.iva).toBeCloseTo(21 + 10.5 + 42);
      expect(r.alicuotas['0.21'].iva).toBeCloseTo(63);
      expect(r.alicuotas['0.105'].iva).toBeCloseTo(10.5);
    });
    it('receipt vacío → 0', () => {
      const r = calcReceiptFiscal([]);
      expect(r.total).toBe(0);
      expect(r.neto).toBe(0);
    });
  });

  describe('Comprobante AFIP', () => {
    it('getCbteTipo RI→RI = Factura A (1) / RI→CF = Factura B (6)', () => {
      expect(getCbteTipo('Responsable Inscripto', 'Responsable Inscripto')).toBe(1);
      expect(getCbteTipo('Responsable Inscripto', 'Consumidor Final')).toBe(6);
      expect(getCbteTipo('Responsable Inscripto', 'Monotributo')).toBe(6);
    });
    it('Monotributo emisor → Factura C (11)', () => {
      expect(getCbteTipo('Monotributo', 'Consumidor Final')).toBe(11);
      expect(getCbteTipo('Monotributo', 'Responsable Inscripto')).toBe(11);
    });
    it('Consumidor Final emisor → B', () => {
      expect(getCbteTipo('Consumidor Final', 'Consumidor Final')).toBe(6);
    });
  });

  describe('buildAfipPayload WSFEv1', () => {
    it('construye payload CAE con idempotencia client_uuid y totales discriminados', () => {
      const p = buildAfipPayload({
        clientUuid: 'cli_123',
        cuitEmisor: '20-12345678-6',
        ptoVta: 1,
        cbteTipo: 6,
        docNroReceptor: '0',
        docTipoReceptor: 99,
        condicionEmisor: 'Responsable Inscripto',
        condicionReceptor: 'Consumidor Final',
        lines: [{ quantity: 1, unitPriceIncl: 121, taxRate: 0.21 }],
      });
      expect(p.client_uuid).toBe('cli_123');
      expect(p.cuit).toBe('20123456786');
      expect(p.ptoVta).toBe(1);
      expect(p.cbteTipo).toBe(6);
      expect(p.impTotal).toBe(121);
      expect(p.impNeto).toBe(100);
      expect(p.impIVA).toBe(21);
      expect(p.iva[0].Id).toBe(5); // 21%
      expect(p.iva[0].BaseImp).toBe(100);
      expect(p.iva[0].Importe).toBe(21);
    });
    it('payload agrupa dos alícuotas distintas', () => {
      const p = buildAfipPayload({
        clientUuid: 'cli_2',
        cuitEmisor: '20123456786',
        ptoVta: 2,
        cbteTipo: 6,
        docNroReceptor: '0',
        docTipoReceptor: 99,
        condicionEmisor: 'Responsable Inscripto',
        condicionReceptor: 'Consumidor Final',
        lines: [
          { quantity: 1, unitPriceIncl: 121, taxRate: 0.21 },
          { quantity: 1, unitPriceIncl: 110.5, taxRate: 0.105 },
        ],
      });
      expect(p.iva).toHaveLength(2);
      expect(p.impTotal).toBeCloseTo(231.5);
    });
    it('lanza si CUIT inválido', () => {
      expect(() =>
        buildAfipPayload({
          clientUuid: 'c',
          cuitEmisor: '20-12345678-9',
          ptoVta: 1,
          cbteTipo: 6,
          docNroReceptor: '0',
          docTipoReceptor: 99,
          condicionEmisor: 'Responsable Inscripto',
          condicionReceptor: 'Consumidor Final',
          lines: [{ quantity: 1, unitPriceIncl: 100, taxRate: 0.21 }],
        })
      ).toThrow();
    });
  });
});
