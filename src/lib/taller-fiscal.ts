export type CondicionIVA =
  | 'Responsable Inscripto'
  | 'Monotributo'
  | 'Consumidor Final'
  | 'Exento'
  | 'No Responsable'
  | 'IVA Sujeto Exento';

export type TallerCategory = 'Repuestos' | 'Aceites' | 'Accesorios' | 'Quimicos' | 'Herramientas' | 'Otros';

export const ALLOWED_TAX_RATES = [0, 0.105, 0.21, 0.27] as const;
export type AllowedTaxRate = (typeof ALLOWED_TAX_RATES)[number];

export const CATEGORIA_IVA_DEFAUT: Record<TallerCategory, AllowedTaxRate> = {
  Repuestos: 0.21,
  Aceites: 0.21,
  Accesorios: 0.21,
  Quimicos: 0.21,
  Herramientas: 0.21,
  Otros: 0.21,
};

// AFIP WsFev1 Alícuota Id
export const AFIP_TAX_ID_MAP: Record<number, number> = {
  0: 3, // 0%
  0.105: 4, // 10.5%
  0.21: 5, // 21%
  0.27: 6, // 27%
};

export function normalizeCuit(raw: string): string {
  return (raw ?? '').replace(/\D/g, '');
}

export function formatCuit(raw: string): string {
  const d = normalizeCuit(raw);
  if (d.length !== 11) return raw;
  return `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`;
}

export function isValidCuit(raw: string): boolean {
  const d = normalizeCuit(raw);
  if (d.length !== 11) return false;
  if (!/^\d{11}$/.test(d)) return false;
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(d[i], 10) * weights[i];
  const mod = sum % 11;
  let ver = 11 - mod;
  if (ver === 11) ver = 0;
  if (ver === 10) ver = 9;
  return ver === parseInt(d[10], 10);
}

export function isValidTaxRate(v: number): boolean {
  return (ALLOWED_TAX_RATES as readonly number[]).includes(v);
}

export function getIvaRateForCategory(category: TallerCategory, override?: number): AllowedTaxRate {
  if (override !== undefined && isValidTaxRate(override)) return override as AllowedTaxRate;
  return CATEGORIA_IVA_DEFAUT[category] ?? 0.21;
}

// Línea fiscal: unitPriceIncl es precio unitario con IVA si ivaIncluido!==false, neto si false
export interface LineInput {
  quantity: number;
  unitPriceIncl: number;
  taxRate: number;
  ivaIncluido?: boolean;
}
export interface LineFiscal {
  quantity: number;
  taxRate: number;
  neto: number;
  iva: number;
  total: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function calcLineFiscal(input: LineInput): LineFiscal {
  const q = input.quantity;
  const r = input.taxRate;
  const incluido = input.ivaIncluido !== false;
  if (incluido) {
    const total = round2(input.unitPriceIncl * q);
    const neto = round2(total / (1 + r));
    const iva = round2(total - neto);
    // Ajuste por redondeo alternativo para casos exactos como 121/1.21
    // total - neto ya da iva exacto a 2 dec.
    return { quantity: q, taxRate: r, neto, iva, total };
  } else {
    const neto = round2(input.unitPriceIncl * q);
    const iva = round2(neto * r);
    const total = round2(neto + iva);
    return { quantity: q, taxRate: r, neto, iva, total };
  }
}

export interface ReceiptFiscal {
  neto: number;
  iva: number;
  total: number;
  alicuotas: Record<string, { base: number; iva: number; rate: number }>;
}

export function calcReceiptFiscal(lines: LineInput[]): ReceiptFiscal {
  let neto = 0;
  let iva = 0;
  let total = 0;
  const alicuotas: ReceiptFiscal['alicuotas'] = {};
  for (const l of lines) {
    const lf = calcLineFiscal(l);
    neto = round2(neto + lf.neto);
    iva = round2(iva + lf.iva);
    total = round2(total + lf.total);
    const key = String(l.taxRate);
    if (!alicuotas[key]) alicuotas[key] = { base: 0, iva: 0, rate: l.taxRate };
    alicuotas[key].base = round2(alicuotas[key].base + lf.neto);
    alicuotas[key].iva = round2(alicuotas[key].iva + lf.iva);
  }
  return { neto, iva, total, alicuotas };
}

// CbteTipo AFIP
export function getCbteTipo(emisor: CondicionIVA, receptor: CondicionIVA): number {
  if (emisor === 'Monotributo') return 11; // Factura C
  if (emisor === 'Responsable Inscripto' && receptor === 'Responsable Inscripto') return 1; // Factura A
  // RI→CF/Mono/Exento/NoResp y CF→cualquiera => B (6)
  return 6; // Factura B
}

export interface AfipPayloadInput {
  clientUuid: string;
  cuitEmisor: string;
  ptoVta: number;
  cbteTipo: number;
  docTipoReceptor: number; // 80 CUIT, 96 DNI, 99 CF
  docNroReceptor: string;
  condicionEmisor: CondicionIVA;
  condicionReceptor: CondicionIVA;
  lines: LineInput[];
}

export interface AfipPayload {
  client_uuid: string;
  cuit: string;
  ptoVta: number;
  cbteTipo: number;
  docTipo: number;
  docNro: string;
  impTotal: number;
  impNeto: number;
  impIVA: number;
  iva: { Id: number; BaseImp: number; Importe: number }[];
}

export function buildAfipPayload(input: AfipPayloadInput): AfipPayload {
  const cuitNorm = normalizeCuit(input.cuitEmisor);
  if (!isValidCuit(cuitNorm)) throw new Error('CUIT emisor inválido');
  if (!input.clientUuid) throw new Error('client_uuid requerido para idempotencia');
  const fiscal = calcReceiptFiscal(input.lines);
  const iva = Object.values(fiscal.alicuotas)
    .filter(a => a.rate !== 0)
    .map(a => ({
      Id: AFIP_TAX_ID_MAP[a.rate] ?? 5,
      BaseImp: a.base,
      Importe: a.iva,
    }));
  // Si solo exento, AFIP igual espera iva vacío con ImpIVA 0
  return {
    client_uuid: input.clientUuid,
    cuit: cuitNorm,
    ptoVta: input.ptoVta,
    cbteTipo: input.cbteTipo,
    docTipo: input.docTipoReceptor,
    docNro: normalizeCuit(input.docNroReceptor) || input.docNroReceptor,
    impTotal: fiscal.total,
    impNeto: fiscal.neto,
    impIVA: fiscal.iva,
    iva,
  };
}

// ─── Config fiscal persistida (localStorage) ───
export interface FiscalConfig {
  cuit: string; // 11 dígitos
  razonSocial: string;
  ptoVta: number; // 1..9999
  condicionIva: CondicionIVA;
  ivaIncluido: boolean;
}

export const FISCAL_CONFIG_KEY = 'tallerflow-fiscal-config';
export const DEFAULT_FISCAL_CONFIG: FiscalConfig = {
  cuit: '',
  razonSocial: '',
  ptoVta: 1,
  condicionIva: 'Monotributo',
  ivaIncluido: true,
};

export function getFiscalConfig(): FiscalConfig {
  if (typeof window === 'undefined') return DEFAULT_FISCAL_CONFIG;
  try {
    const raw = window.localStorage.getItem(FISCAL_CONFIG_KEY);
    if (!raw) return DEFAULT_FISCAL_CONFIG;
    const parsed = JSON.parse(raw) as Partial<FiscalConfig>;
    return { ...DEFAULT_FISCAL_CONFIG, ...parsed, ptoVta: Number(parsed.ptoVta) || 1 };
  } catch { return DEFAULT_FISCAL_CONFIG; }
}

export function saveFiscalConfig(cfg: FiscalConfig): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(FISCAL_CONFIG_KEY, JSON.stringify(cfg));
}

export function validateFiscalConfig(cfg: FiscalConfig): string | null {
  if (cfg.cuit && !isValidCuit(cfg.cuit)) return 'CUIT inválido';
  if (cfg.ptoVta < 1 || cfg.ptoVta > 9999) return 'Punto de venta 1..9999';
  if (!cfg.razonSocial.trim()) return null; // opcional hasta facturar
  return null;
}
