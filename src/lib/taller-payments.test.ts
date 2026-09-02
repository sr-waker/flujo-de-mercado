import { describe, it, expect } from 'vitest';
import {
  normalizeAlias,
  isValidCbu,
  isValidAlias,
  shouldCountInDashboard,
  mapMpStatus,
  createPendingTransfer,
  approveTransfer,
  rejectTransfer,
  getDashboardImpact,
  isAllowedProvider,
  isAllowedStatus,
  validateMpWebhookPayload,
} from './taller-payments';

describe('taller-payments', () => {
  it('normalizeAlias lower+trim', () => {
    expect(normalizeAlias(' Taller.Flujo-MP ')).toBe('taller.flujo-mp');
  });
  it('isValidCbu 22 dígitos', () => {
    expect(isValidCbu('0000003100010000000001')).toBe(true);
    expect(isValidCbu('123')).toBe(false);
    expect(isValidCbu('000000310001000000000A')).toBe(false);
    expect(isValidCbu('')).toBe(false);
  });
  it('isValidAlias 6-25 alfanum', () => {
    expect(isValidAlias('taller.mp')).toBe(true);
    expect(isValidAlias('mi-alias_123')).toBe(true);
    expect(isValidAlias('ab')).toBe(false);
    expect(isValidAlias('a'.repeat(30))).toBe(false);
    expect(isValidAlias('alias con espacio')).toBe(false);
  });
  it('isAllowedProvider / isAllowedStatus', () => {
    expect(isAllowedProvider('mercadopago')).toBe(true);
    expect(isAllowedProvider('cuentadni')).toBe(true);
    expect(isAllowedProvider('manual')).toBe(true);
    expect(isAllowedProvider('paypal' as any)).toBe(false);
    expect(isAllowedStatus('pending')).toBe(true);
    expect(isAllowedStatus('approved')).toBe(true);
    expect(isAllowedStatus('rejected')).toBe(true);
    expect(isAllowedStatus('cancelled' as any)).toBe(false);
  });
  it('shouldCountInDashboard solo approved', () => {
    expect(shouldCountInDashboard('approved')).toBe(true);
    expect(shouldCountInDashboard('pending')).toBe(false);
    expect(shouldCountInDashboard('rejected')).toBe(false);
  });
  it('mapMpStatus approved/pending/rejected', () => {
    expect(mapMpStatus('approved')).toBe('approved');
    expect(mapMpStatus('pending')).toBe('pending');
    expect(mapMpStatus('in_process')).toBe('pending');
    expect(mapMpStatus('rejected')).toBe('rejected');
    expect(mapMpStatus('cancelled')).toBe('rejected');
    expect(mapMpStatus('unknown' as any)).toBe('pending');
  });
  it('createPendingTransfer genera pending idempotente', () => {
    const t = createPendingTransfer({ receiptId: 'r1', amount: 15000, provider: 'cuentadni' });
    expect(t.status).toBe('pending');
    expect(t.provider).toBe('cuentadni');
    expect(t.amount).toBe(15000);
    expect(t.receiptId).toBe('r1');
    expect(t.id).toBeTruthy();
    expect(t.createdAt).toBeTruthy();
  });
  it('approveTransfer pasa a approved con timestamp y es idempotente', () => {
    const t = createPendingTransfer({ receiptId: 'r2', amount: 20000, provider: 'mercadopago' });
    const a1 = approveTransfer(t, 'mp_123');
    expect(a1.status).toBe('approved');
    expect(a1.externalId).toBe('mp_123');
    expect(a1.approvedAt).toBeTruthy();
    const a2 = approveTransfer(a1, 'mp_123');
    expect(a2.status).toBe('approved');
    expect(a2.approvedAt).toBe(a1.approvedAt);
  });
  it('rejectTransfer pasa a rejected', () => {
    const t = createPendingTransfer({ receiptId: 'r3', amount: 5000, provider: 'manual' });
    const r = rejectTransfer(t, 'monto no coincide');
    expect(r.status).toBe('rejected');
    expect(r.comprobanteUrl).toBeUndefined();
  });
  it('getDashboardImpact suma solo approved pero cuenta pendientes', () => {
    const p1 = createPendingTransfer({ receiptId: 'r1', amount: 10000, provider: 'mercadopago' });
    const p2 = approveTransfer(createPendingTransfer({ receiptId: 'r2', amount: 20000, provider: 'mercadopago' }), 'mp1');
    const p3 = approveTransfer(createPendingTransfer({ receiptId: 'r3', amount: 5000, provider: 'cuentadni' }), 'dni1');
    const rej = rejectTransfer(createPendingTransfer({ receiptId: 'r4', amount: 7000, provider: 'manual' }));
    const impact = getDashboardImpact([p1, p2, p3, rej]);
    expect(impact.approvedTotal).toBe(25000);
    expect(impact.pendingCount).toBe(1);
    expect(impact.pendingTotal).toBe(10000);
    expect(impact.rejectedCount).toBe(1);
    expect(impact.approvedCount).toBe(2);
  });
  it('validateMpWebhookPayload valida shape mínimo', () => {
    expect(validateMpWebhookPayload(null).ok).toBe(false);
    expect(validateMpWebhookPayload({}).ok).toBe(false);
    expect(validateMpWebhookPayload({ data: { id: '123' }, type: 'payment' }).ok).toBe(false);
    expect(validateMpWebhookPayload({ data: { id: '123' }, type: 'payment', action: 'payment.created' }).ok).toBe(true);
    expect(validateMpWebhookPayload({ id: 'mp_1', status: 'approved', external_reference: 'r1', transaction_amount: 100 }).ok).toBe(true);
  });
});
