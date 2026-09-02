import { doc, setDoc } from 'firebase/firestore';
import type { PushFn } from './sync-engine';
import type { Firestore } from 'firebase/firestore';

/**
 * Crea un PushFn real que escribe LocalReceipt -> collection sales.
 * Idempotente por doc id = receipt.id (client_uuid Loyverse-style).
 * Maps IVA 21% CABA ya calculado en enqueueReceipt.
 */
export function createFirestorePush(db: Firestore, userId: string): PushFn {
  return async (receipt) => {
    const ref = doc(db, 'sales', receipt.id);
    const saleData: any = {
      id: receipt.id,
      userId,
      sessionId: receipt.storeId ?? 'offline',
      cashierId: userId,
      timestamp: new Date(receipt.createdAt).getTime(),
      saleDateTime: receipt.createdAt,
      isCompleted: true,
      isOfflineSynced: true,
      items: receipt.lines.map((l) => ({
        productId: l.productId,
        quantity: Number(l.quantity) || 0,
        price: Number(l.unitPrice) || 0,
        total: Number(l.lineTotal) || 0,
      })),
      total: Number(receipt.total) || 0,
      subtotal: Number(receipt.subtotal) || 0,
      iva: Number(receipt.iva) || 0,
      paymentMethod: receipt.payments?.[0]?.type ?? 'Efectivo',
      payments: receipt.payments,
      customerId: receipt.customerId ?? null,
      cae: receipt.cae ?? null,
      caeVto: receipt.caeVto ?? null,
    };
    await setDoc(ref, saleData, { merge: true });
    return { ok: true, receiptNumber: receipt.receiptNumber ?? undefined };
  };
}
