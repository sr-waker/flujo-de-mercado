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

export interface AfipQueueItem {
  id: string; // client_uuid idempotente = receipt.id
  receiptId: string;
  status: 'pending' | 'sent' | 'error';
  payload: unknown; // AfipPayload WSFE
  cae?: string | null;
  caeVto?: string | null;
  retries: number;
  lastError?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TransferQueueItem {
  id: string; // client_uuid o pay_xxx
  receiptId?: string | null;
  provider: string; // 'mercadopago' | 'cuentadni' | 'manual'
  status: 'pending' | 'approved' | 'rejected';
  amount: number;
  externalId?: string | null;
  aliasOrCbu?: string | null;
  comprobanteUrl?: string | null;
  note?: string | null;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string | null;
}

class TallerDb extends Dexie {
  products!: Table<LocalProduct, string>;
  customers!: Table<LocalCustomer, string>;
  receipts!: Table<LocalReceipt, string>;
  syncQueue!: Table<SyncQueueItem, string>;
  afipQueue!: Table<AfipQueueItem, string>;
  transferQueue!: Table<TransferQueueItem, string>;

  constructor() {
    super('tallerflow-offline');
    this.version(1).stores({
      products: 'id, userId, barcode, [userId+barcode], category, updatedAt',
      customers: 'id, updatedAt',
      receipts: 'id, status, createdAt',
      syncQueue: 'id, entity, createdAt',
    });
    this.version(2).stores({
      afipQueue: 'id, receiptId, status, createdAt',
    });
    this.version(3).stores({
      transferQueue: 'id, receiptId, status, provider, externalId, createdAt',
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

// ─── Cola CAE / WSFE — idempotente por receipt.id (client_uuid) ───
export async function enqueueAfipRequest(input: { receiptId: string; payload: unknown }): Promise<AfipQueueItem> {
  const db = getTallerDb();
  const now = new Date().toISOString();
  const existing = await db.afipQueue.get(input.receiptId);
  if (existing) return existing;
  const row: AfipQueueItem = {
    id: input.receiptId,
    receiptId: input.receiptId,
    status: 'pending',
    payload: input.payload,
    cae: null,
    caeVto: null,
    retries: 0,
    lastError: null,
    createdAt: now,
    updatedAt: now,
  };
  await db.afipQueue.put(row);
  return row;
}

export async function getPendingAfipQueue(): Promise<AfipQueueItem[]> {
  const db = getTallerDb();
  return db.afipQueue.where('status').equals('pending').toArray();
}

export async function getAfipQueueStats(): Promise<{ pending: number; sent: number; error: number }> {
  const db = getTallerDb();
  const all = await db.afipQueue.toArray();
  return {
    pending: all.filter(r => r.status === 'pending').length,
    sent: all.filter(r => r.status === 'sent').length,
    error: all.filter(r => r.status === 'error').length,
  };
}

export async function markAfipSuccess(id: string, cae: string, caeVto: string | null): Promise<void> {
  const db = getTallerDb();
  const row = await db.afipQueue.get(id);
  if (!row) throw new Error('afip queue item not found');
  await db.afipQueue.put({ ...row, status: 'sent', cae, caeVto: caeVto ?? null, updatedAt: new Date().toISOString() });
  const rcpt = await db.receipts.get(row.receiptId);
  if (rcpt) await db.receipts.put({ ...rcpt, cae, caeVto: caeVto ?? null, status: 'synced', syncedAt: new Date().toISOString() });
}

export async function markAfipError(id: string, error: string): Promise<void> {
  const db = getTallerDb();
  const row = await db.afipQueue.get(id);
  if (!row) throw new Error('afip queue item not found');
  await db.afipQueue.put({ ...row, status: 'error', lastError: error, retries: row.retries + 1, updatedAt: new Date().toISOString() });
}

// ─── Cola Transferencias (Mercado Pago / Cuenta DNI) ─── idempotente por id o externalId
export async function enqueueTransfer(input: {
  id?: string;
  receiptId?: string | null;
  provider: string;
  amount: number;
  externalId?: string | null;
  aliasOrCbu?: string | null;
  comprobanteUrl?: string | null;
}): Promise<TransferQueueItem> {
  const db = getTallerDb();
  const now = new Date().toISOString();
  const id = input.id ?? `pay_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  // idempotencia por externalId si viene (MP)
  if (input.externalId) {
    const byExt = await db.transferQueue.where('externalId').equals(input.externalId).first();
    if (byExt) return byExt;
  }
  const existing = await db.transferQueue.get(id);
  if (existing) return existing;
  const row: TransferQueueItem = {
    id,
    receiptId: input.receiptId ?? null,
    provider: input.provider,
    status: 'pending',
    amount: Number(input.amount) || 0,
    externalId: input.externalId ?? null,
    aliasOrCbu: input.aliasOrCbu ?? null,
    comprobanteUrl: input.comprobanteUrl ?? null,
    note: null,
    createdAt: now,
    updatedAt: now,
    approvedAt: null,
  };
  await db.transferQueue.put(row);
  return row;
}

export async function getPendingTransfers(): Promise<TransferQueueItem[]> {
  const db = getTallerDb();
  return db.transferQueue.where('status').equals('pending').toArray();
}

export async function getTransferQueueStats(): Promise<{ pending: number; approved: number; rejected: number; pendingTotal: number; approvedTotal: number }> {
  const db = getTallerDb();
  const all = await db.transferQueue.toArray();
  return {
    pending: all.filter(r => r.status === 'pending').length,
    approved: all.filter(r => r.status === 'approved').length,
    rejected: all.filter(r => r.status === 'rejected').length,
    pendingTotal: all.filter(r => r.status === 'pending').reduce((s, r) => s + (Number(r.amount) || 0), 0),
    approvedTotal: all.filter(r => r.status === 'approved').reduce((s, r) => s + (Number(r.amount) || 0), 0),
  };
}

export async function markTransferApproved(id: string, externalId?: string | null): Promise<void> {
  const db = getTallerDb();
  const row = await db.transferQueue.get(id);
  if (!row) throw new Error('transfer not found');
  if (row.status === 'approved') return;
  const now = new Date().toISOString();
  await db.transferQueue.put({ ...row, status: 'approved', externalId: externalId ?? row.externalId, approvedAt: row.approvedAt ?? now, updatedAt: now });
}

export async function markTransferRejected(id: string, note?: string): Promise<void> {
  const db = getTallerDb();
  const row = await db.transferQueue.get(id);
  if (!row) throw new Error('transfer not found');
  if (row.status === 'rejected') return;
  await db.transferQueue.put({ ...row, status: 'rejected', note: note ?? null, updatedAt: new Date().toISOString() });
}

export async function markTransferApprovedByExternalId(externalId: string): Promise<TransferQueueItem | null> {
  const db = getTallerDb();
  const row = await db.transferQueue.where('externalId').equals(externalId).first();
  if (!row) return null;
  await markTransferApproved(row.id, externalId);
  return (await db.transferQueue.get(row.id)) ?? null;
}

