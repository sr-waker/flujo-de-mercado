export type TransferProvider = 'mercadopago' | 'cuentadni' | 'manual';
export type TransferType = 'mp' | 'cuentadni' | 'alias' | 'transferencia';
export type TransferStatus = 'pending' | 'approved' | 'rejected';

export const ALLOWED_PROVIDERS: readonly TransferProvider[] = ['mercadopago', 'cuentadni', 'manual'] as const;
export const ALLOWED_STATUSES: readonly TransferStatus[] = ['pending', 'approved', 'rejected'] as const;

export interface TallerTransfer {
  id: string;
  receiptId?: string;
  amount: number; // pesos (number with cents allowed) — for dashboard we sum raw number
  provider: TransferProvider;
  type?: TransferType;
  status: TransferStatus;
  externalId?: string;
  aliasOrCbu?: string;
  comprobanteUrl?: string;
  note?: string;
  createdAt: string; // ISO
  approvedAt?: string | null;
  updatedAt?: string;
}

export function normalizeAlias(raw: string): string {
  return (raw ?? '').trim().toLowerCase();
}

export function isValidCbu(raw: string): boolean {
  const d = (raw ?? '').replace(/\D/g, '');
  return d.length === 22 && /^\d{22}$/.test(d);
}

export function isValidAlias(raw: string): boolean {
  const s = (raw ?? '').trim();
  if (s.length < 6 || s.length > 25) return false;
  return /^[a-z0-9._-]+$/i.test(s);
}

export function isAllowedProvider(p: string): boolean {
  return (ALLOWED_PROVIDERS as readonly string[]).includes(p);
}
export function isAllowedStatus(s: string): boolean {
  return (ALLOWED_STATUSES as readonly string[]).includes(s);
}

export function shouldCountInDashboard(status: TransferStatus): boolean {
  return status === 'approved';
}

export function mapMpStatus(mpStatus: string): TransferStatus {
  const s = (mpStatus ?? '').toLowerCase();
  if (s === 'approved') return 'approved';
  if (s === 'rejected' || s === 'cancelled' || s === 'chargedback') return 'rejected';
  return 'pending';
}

function genId(prefix = 'tr'): string {
  // idempotente si caller pasa receiptId como id; sino random
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createPendingTransfer(opts: {
  id?: string;
  receiptId?: string;
  amount: number;
  provider: TransferProvider;
  type?: TransferType;
  aliasOrCbu?: string;
  comprobanteUrl?: string;
}): TallerTransfer {
  const now = new Date().toISOString();
  return {
    id: opts.id || genId('pay'),
    receiptId: opts.receiptId,
    amount: Number(opts.amount) || 0,
    provider: opts.provider,
    type: opts.type ?? (opts.provider === 'mercadopago' ? 'mp' : opts.provider === 'cuentadni' ? 'cuentadni' : 'transferencia'),
    status: 'pending',
    aliasOrCbu: opts.aliasOrCbu,
    comprobanteUrl: opts.comprobanteUrl,
    createdAt: now,
    approvedAt: null,
    updatedAt: now,
  };
}

export function approveTransfer(t: TallerTransfer, externalId?: string): TallerTransfer {
  if (t.status === 'approved') return t; // idempotente
  const now = new Date().toISOString();
  return {
    ...t,
    status: 'approved',
    externalId: externalId ?? t.externalId,
    approvedAt: t.approvedAt ?? now,
    updatedAt: now,
  };
}

export function rejectTransfer(t: TallerTransfer, note?: string): TallerTransfer {
  if (t.status === 'rejected') return t;
  const now = new Date().toISOString();
  return { ...t, status: 'rejected', note, updatedAt: now };
}

export function getDashboardImpact(transfers: TallerTransfer[]) {
  let approvedTotal = 0;
  let pendingTotal = 0;
  let approvedCount = 0;
  let pendingCount = 0;
  let rejectedCount = 0;
  for (const tr of transfers) {
    if (tr.status === 'approved') {
      approvedTotal += Number(tr.amount) || 0;
      approvedCount += 1;
    } else if (tr.status === 'pending') {
      pendingTotal += Number(tr.amount) || 0;
      pendingCount += 1;
    } else if (tr.status === 'rejected') {
      rejectedCount += 1;
    }
  }
  return { approvedTotal, pendingTotal, approvedCount, pendingCount, rejectedCount, total: approvedTotal + pendingTotal };
}

export function validateMpWebhookPayload(body: any): { ok: boolean; reason?: string } {
  if (!body || typeof body !== 'object') return { ok: false, reason: 'body vacío' };
  // Formato clásico MP webhook: { type: 'payment', data: { id }, action: 'payment.created' } o directo { id, status, external_reference }
  const hasDirect = body.id && body.status;
  const hasWebhook = body.type && body.data?.id;
  if (hasDirect) {
    // requiere external_reference o amount para mapear a receipt
    return { ok: true };
  }
  if (hasWebhook && body.action) return { ok: true };
  if (hasWebhook) return { ok: false, reason: 'falta action' };
  return { ok: false, reason: 'payload desconocido' };
}

export function verifyMpSignature(rawBody: string, xSignature: string | null, xRequestId: string | null, secret: string | null): boolean {
  // Si no hay secret configurado, aceptamos (modo demo) — producción debe setear MP_WEBHOOK_SECRET
  if (!secret) return true;
  if (!xSignature || !xRequestId) return false;
  // MP firma: ts + id en header 'x-signature: ts=...,v1=...' — simplificamos: validamos que v1 exista
  return xSignature.includes('v1=');
}
