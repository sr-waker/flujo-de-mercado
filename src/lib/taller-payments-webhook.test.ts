import { describe, it, expect } from 'vitest';
import { validateMpWebhookPayload, verifyMpSignature, mapMpStatus } from './taller-payments';

describe('webhook mercadopago helpers', () => {
  it('validateMpWebhookPayload directo ok', () => {
    expect(validateMpWebhookPayload({ id: 'pay_123', status: 'approved' }).ok).toBe(true);
  });
  it('validateMpWebhookPayload webhook clásico ok', () => {
    expect(validateMpWebhookPayload({ type: 'payment', data: { id: '1' }, action: 'payment.created' }).ok).toBe(true);
  });
  it('validateMpWebhookPayload webhook sin action falla', () => {
    expect(validateMpWebhookPayload({ type: 'payment', data: { id: '1' } }).ok).toBe(false);
  });
  it('verifyMpSignature sin secret acepta (demo)', () => {
    expect(verifyMpSignature('{}', null, null, null)).toBe(true);
  });
  it('verifyMpSignature con secret requiere v1=', () => {
    expect(verifyMpSignature('{}', 'ts=1,v1=abc', 'req-1', 'sec')).toBe(true);
    expect(verifyMpSignature('{}', 'ts=1', 'req-1', 'sec')).toBe(false);
    expect(verifyMpSignature('{}', null, 'req-1', 'sec')).toBe(false);
  });
  it('mapMpStatus covered', () => {
    expect(mapMpStatus('approved')).toBe('approved');
    expect(mapMpStatus('pending')).toBe('pending');
    expect(mapMpStatus('rejected')).toBe('rejected');
  });
});
