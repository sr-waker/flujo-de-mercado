import Dexie, { Table } from 'dexie';

export type TallerCategory = 'Repuestos' | 'Aceites' | 'Accesorios' | 'Quimicos' | 'Herramientas' | 'Otros';

export interface LocalProduct {
  id: string;
  storeId?: string;
  userId: string;
  name: string;
  category: TallerCategory;
  barcode: string; // normalizado lower+trim, único por userId
  sku?: string;
  price: number; // centavos
  cost?: number;
  quantity: number; // enteros para Aceites (ya validado en validators)
  taxRate?: number; // 0.21 por defecto
  updatedAt: string;
  deletedAt?: string | null;
}

export interface LocalCustomer {
  id: string;
  storeId?: string;
  name: string;
  email?: string;
  phone?: string;
  cuit?: string;
  condicionIva?: string;
  updatedAt: string;
}

export interface LocalReceipt {
  id: string; // client_uuid para idempotencia
  storeId?: string;
  userId?: string;
  customerId?: string | null;
  receiptNumber?: string | null;
  status: 'pending' | 'synced' | 'cae_error';
  subtotal: number;
  iva: number;
  total: number;
  cae?: string | null;
  caeVto?: string | null;
  lines: { productId: string; quantity: number; unitPrice: number; lineTotal: number }[];
  payments: { type: string; amount: number }[];
  createdAt: string;
  syncedAt?: string | null;
}

export interface SyncQueueItem {
  id: string;
  entity: string;
  payload: unknown;
  retries: number;
  lastError?: string | null;
  createdAt: string;
}

class TallerDb extends Dexie {
  products!: Table<LocalProduct, string>;
  customers!: Table<LocalCustomer, string>;
  receipts!: Table<LocalReceipt, string>;
  syncQueue!: Table<SyncQueueItem, string>;

  constructor() {
    super('tallerflow-offline');
    this.version(1).stores({
      products: 'id, userId, barcode, [userId+barcode], category, updatedAt',
      customers: 'id, updatedAt',
      receipts: 'id, status, createdAt',
      syncQueue: 'id, entity, createdAt',
    });
  }
}

let dbInstance: TallerDb | null = null;
export function getTallerDb(): TallerDb {
  if (!dbInstance) dbInstance = new TallerDb();
  return dbInstance;
}

function normBarcode(v: string) {
  return v.trim().toLowerCase();
}

export async function putProductLocal(p: Omit<LocalProduct, 'updatedAt'> & { updatedAt?: string }): Promise<LocalProduct> {
  const db = getTallerDb();
  const barcodeNorm = normBarcode(p.barcode);
  if (!barcodeNorm) throw new Error('barcode requerido');
  // unicidad por userId + barcodeNorm (aislamiento por owner como Firestore rules)
  const existing = await db.products.where('[userId+barcode]').equals([p.userId, barcodeNorm]).first();
  // Si es otro id con mismo barcode+user, rechazar
  if (existing && existing.id !== p.id) throw new Error('barcode duplicado para este usuario');

  const row: LocalProduct = {
    ...p,
    barcode: barcodeNorm,
    updatedAt: p.updatedAt ?? new Date().toISOString(),
    taxRate: p.taxRate ?? 0.21,
  };
  await db.products.put(row as LocalProduct);
  return row;
}

export async function enqueueReceipt(input: {
  id?: string;
  storeId?: string;
  userId?: string;
  customerId?: string | null;
  lines: { productId: string; quantity: number; unitPrice: number }[];
  payments: { type: string; amount: number }[];
  taxRate?: number;
}): Promise<LocalReceipt> {
  const db = getTallerDb();
  const taxRate = input.taxRate ?? 0.21;
  const lines = input.lines.map(l => ({ ...l, lineTotal: l.quantity * l.unitPrice }));
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  const iva = Math.round(subtotal * taxRate);
  const total = subtotal + iva;
  const id = input.id ?? `cli_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const receipt: LocalReceipt = {
    id,
    storeId: input.storeId,
    userId: input.userId,
    customerId: input.customerId ?? null,
    receiptNumber: null,
    status: 'pending',
    subtotal,
    iva,
    total,
    cae: null,
    caeVto: null,
    lines,
    payments: input.payments,
    createdAt: new Date().toISOString(),
    syncedAt: null,
  };
  await db.receipts.put(receipt);
  await db.syncQueue.put({ id: `sync_${id}`, entity: 'receipts', payload: receipt, retries: 0, lastError: null, createdAt: receipt.createdAt });
  return receipt;
}

export async function getPendingReceipts(): Promise<LocalReceipt[]> {
  const db = getTallerDb();
  return db.receipts.where('status').equals('pending').toArray();
}
