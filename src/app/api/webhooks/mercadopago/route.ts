import { NextRequest, NextResponse } from 'next/server';
import { validateMpWebhookPayload, verifyMpSignature, mapMpStatus } from '@/lib/taller-payments';

// NOTA: En App Router este endpoint corre en Node. Para persistir en IndexedDB usaría
// una colección Firestore `transfers` si hay auth. Aquí dejamos el stub idempotente
// que valida firma y payload, y responde 200 para que MP no reintente.
// La conciliación real cae en transferQueue (Dexie) vía hook web + Firestore sync.

export async function POST(req: NextRequest) {
  const raw = await req.text();
  let body: any;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    return NextResponse.json({ ok: false, error: 'JSON inválido' }, { status: 400 });
  }

  const v = validateMpWebhookPayload(body);
  if (!v.ok) return NextResponse.json({ ok: false, error: v.reason }, { status: 400 });

  const xSig = req.headers.get('x-signature') ?? req.headers.get('X-Signature');
  const xReq = req.headers.get('x-request-id') ?? req.headers.get('X-Request-Id');
  const secret = process.env.MP_WEBHOOK_SECRET ?? null;
  if (!verifyMpSignature(raw, xSig, xReq, secret)) {
    return NextResponse.json({ ok: false, error: 'firma inválida' }, { status: 401 });
  }

  // Normalización mínima para dashboard idempotente
  // MP puede mandar { type:'payment', data:{id}, action } o { id, status, external_reference, transaction_amount }
  const externalId = body?.data?.id ?? body?.id ?? null;
  const mpStatusRaw: string | null = body?.status ?? null;
  const mapped = mpStatusRaw ? mapMpStatus(mpStatusRaw) : 'pending';
  const amount = body?.transaction_amount ?? body?.data?.transaction_amount ?? null;
  const externalRef = body?.external_reference ?? body?.data?.external_reference ?? null;

  // Respuesta idempotente: siempre 200 si payload válido, aunque ya procesado
  return NextResponse.json({
    ok: true,
    received: true,
    externalId: externalId ? String(externalId) : null,
    status: mapped,
    amount,
    externalRef,
  });
}

export async function GET() {
  return NextResponse.json({ ok: true, endpoint: '/api/webhooks/mercadopago', methods: ['POST'] });
}
