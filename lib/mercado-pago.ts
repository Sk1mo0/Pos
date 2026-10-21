import { cookies } from 'next/headers';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { prisma } from './prisma';
import { Prisma } from '../generated/prisma/client';
import { HttpError, priceSale, saleSchema } from './pos-api';
import { config, equal, hash, secret, seal, unseal, matchesPayment, validWebhook, type ProviderPayment } from './mercado-pago-security';

const businessSchema = z.enum(['tacos', 'tienda']);
type Tokens = { access_token: string; refresh_token: string; expires_in: number; user_id: number };
type Session = { business: string; sellerId: string; expires: number };
class PaymentError extends Error { constructor(message: string, public status = 409) { super(message); } }
const cookieOptions = { httpOnly: true, secure: true, sameSite: 'lax' as const, path: '/' };
const sessionName = (business: string) => `mp_session_${business}`;
async function provider<T>(path: string, token?: string, body?: unknown, method?: string): Promise<T> {
  const response = await fetch(`https://api.mercadopago.com${path}`, {
    method: method || (body ? 'POST' : 'GET'), cache: 'no-store', signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw new PaymentError(response.status === 401 ? 'Vuelve a conectar tu cuenta de Mercado Pago.' : 'Mercado Pago no pudo completar la solicitud. Intenta de nuevo.', 502);
  return response.json();
}
function tokenData(tokens: Tokens) {
  if (!tokens.access_token || !tokens.refresh_token || !Number.isFinite(tokens.expires_in) || !tokens.user_id) throw new PaymentError('Respuesta de autorización inválida.', 502);
  return { sellerId: String(tokens.user_id), credentials: seal(tokens), expiresAt: new Date(Date.now() + tokens.expires_in * 1000) };
}
async function access(business: string) {
  // Serialize refreshes across processes; refresh tokens may rotate.
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Business" WHERE id = ${business} FOR UPDATE`;
    const connection = await tx.mercadoPagoConnection.findUnique({ where: { business } });
    if (!connection) throw new PaymentError('Conecta Mercado Pago antes de cobrar.');
    let tokens = unseal<Tokens>(connection.credentials);
    if (connection.expiresAt.getTime() < Date.now() + 60000) {
      tokens = await provider<Tokens>('/oauth/token', undefined, { client_id: config().clientId, client_secret: config().clientSecret, grant_type: 'refresh_token', refresh_token: tokens.refresh_token });
      const data = tokenData(tokens);
      if (data.sellerId !== connection.sellerId) throw new PaymentError('La cuenta autorizada cambió.');
      await tx.mercadoPagoConnection.update({ where: { business }, data });
    }
    return tokens.access_token;
  }, { timeout: 20000 });
}
async function authorized(business: string) {
  const connection = await prisma.mercadoPagoConnection.findUnique({ where: { business } });
  try {
    const cookie = (await cookies()).get(sessionName(business));
    const session = cookie && unseal<Session>(cookie.value);
    return !!(connection && session && session.business === business && session.sellerId === connection.sellerId && session.expires > Date.now());
  } catch { return false; }
}
async function requireSession(business: string) {
  if (!await authorized(business)) throw new PaymentError('Inicia sesión con la cuenta vinculada de Mercado Pago.', 401);
}
function sameOrigin(request: Request) {
  if (request.headers.get('origin') !== config().origin) throw new PaymentError('Origen de solicitud inválido.', 403);
}
async function saveApproved(orderId: string, payment: ProviderPayment) {
  return prisma.$transaction(async tx => {
    const found = await tx.paymentOrder.findUnique({ where: { id: orderId } });
    if (!found || !matchesPayment(payment, found)) throw new PaymentError('El pago no corresponde al importe y cuenta de este pedido.');
    await tx.$queryRaw`SELECT id FROM "Business" WHERE id = ${found.business} FOR UPDATE`;
    const order = await tx.paymentOrder.findUniqueOrThrow({ where: { id: orderId } });
    const existing = await tx.sale.findUnique({ where: { id: order.id } });
    if (existing) {
      if (existing.method !== 'Mercado Pago' || existing.business !== order.business || existing.total !== order.total) throw new PaymentError('Existe una venta distinta con este identificador.');
      return existing;
    }
    const shift = await tx.shift.findUnique({ where: { id: order.shift } });
    if (!shift || shift.closed) throw new PaymentError('El turno del cobro está cerrado. Revisa el pago con administración.');
    const shop = await tx.business.update({ where: { id: order.business }, data: { sequence: { increment: 1 } } });
    const sale = await tx.sale.create({ data: { id: order.id, business: order.business, shift: order.shift, items: order.items as Prisma.InputJsonValue, total: order.total, received: order.total, change: 0, method: 'Mercado Pago', reference: String(payment.id), mode: order.mode, note: order.note, number: String(shop.sequence).padStart(4, '0') } });
    await tx.paymentOrder.update({ where: { id: order.id }, data: { status: 'approved', paymentId: String(payment.id) } });
    return sale;
  });
}
async function reconcile(id: string, paymentId?: string) {
  const order = await prisma.paymentOrder.findUniqueOrThrow({ where: { id } });
  if (order.status === 'approved') return;
  if (!order.preferenceId) return; // A failed/ambiguous preference creation can safely be retried.
  const token = await access(order.business);
  const payments = paymentId ? [await provider<ProviderPayment>(`/v1/payments/${encodeURIComponent(paymentId)}`, token)] : (await provider<{ results: ProviderPayment[] }>(`/v1/payments/search?external_reference=${encodeURIComponent(id)}&sort=date_created&criteria=desc&limit=100`, token)).results;
  const approved = payments.find(p => matchesPayment(p, order));
  if (approved) { await saveApproved(id, approved); return; }
  // Rejections apply to an attempt, not the order: buyers can retry the same checkout.
  // Only release an expired checkout when no payment is still processing.
  if (order.expiresAt.getTime() + 60000 < Date.now() && !payments.some(p => ['pending', 'in_process', 'authorized', 'in_mediation'].includes(p.status))) {
    await prisma.paymentOrder.updateMany({ where: { id, status: 'pending' }, data: { status: 'expired' } });
  }
}

export async function mercadoPago(request: Request, context: { params: Promise<{ action: string }> }) {
  try {
    const { action } = await context.params;
    const url = new URL(request.url);
    if (action === 'webhook' && request.method === 'POST') {
      config();
      if (!validWebhook(request)) throw new PaymentError('Firma inválida.', 401);
      const body = await request.json();
      if (body.type !== 'payment') return Response.json({ received: true });
      const seller = String(body.user_id || '');
      const connection = await prisma.mercadoPagoConnection.findFirst({ where: { sellerId: seller } });
      if (!connection) return Response.json({ received: true });
      const id = url.searchParams.get('data.id')!;
      const payment = await provider<ProviderPayment>(`/v1/payments/${encodeURIComponent(id)}`, await access(connection.business));
      const order = await prisma.paymentOrder.findUnique({ where: { id: payment.external_reference || '' } });
      if (order && order.sellerId === seller) await reconcile(order.id, id);
      return Response.json({ received: true });
    }
    if (action === 'callback' && request.method === 'GET') {
      const jar = await cookies(), state = url.searchParams.get('state') || '';
      if (!state || !equal(jar.get('mp_oauth')?.value || '', state)) throw new PaymentError('La autorización venció. Intenta conectar de nuevo.', 400);
      jar.delete('mp_oauth');
      const attempt = await prisma.mercadoPagoOAuth.findUnique({ where: { id: hash(state) } });
      if (!attempt || attempt.expiresAt.getTime() < Date.now()) throw new PaymentError('La autorización venció.', 400);
      const consumed = await prisma.mercadoPagoOAuth.deleteMany({ where: { id: attempt.id } });
      if (!consumed.count) throw new PaymentError('La autorización ya se utilizó.', 400);
      if (url.searchParams.has('error') || !url.searchParams.get('code')) return Response.redirect(`${config().origin}/pagos?mp=cancelled`, 303);
      const tokens = await provider<Tokens>('/oauth/token', undefined, { client_id: config().clientId, client_secret: config().clientSecret, grant_type: 'authorization_code', code: url.searchParams.get('code'), redirect_uri: `${config().origin}/api/mercadopago/callback`, code_verifier: unseal<string>(attempt.verifier) });
      const data = tokenData(tokens);
      await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM "Business" WHERE id = ${attempt.business} FOR UPDATE`;
        const existing = await tx.mercadoPagoConnection.findUnique({ where: { business: attempt.business } });
        if (existing && existing.sellerId !== data.sellerId) throw new PaymentError('Inicia sesión con la cuenta de Mercado Pago ya vinculada a este negocio.');
        await tx.mercadoPagoConnection.upsert({ where: { business: attempt.business }, create: { business: attempt.business, ...data }, update: data });
      });
      jar.set(sessionName(attempt.business), seal({ business: attempt.business, sellerId: data.sellerId, expires: Date.now() + 86400000 }), { ...cookieOptions, maxAge: 86400 });
      return Response.redirect(`${config().origin}/pagos?business=${attempt.business}&mp=connected`, 303);
    }
    const business = businessSchema.parse(url.searchParams.get('business'));
    if (action === 'status' && request.method === 'GET') {
      try { config(); } catch { return Response.json({ configured: false, connected: false, authorized: false, orders: [] }); }
      const connection = await prisma.mercadoPagoConnection.findUnique({ where: { business }, select: { sellerId: true } });
      const loggedIn = await authorized(business);
      return Response.json({ configured: true, connected: !!connection, authorized: loggedIn, sellerId: loggedIn ? connection?.sellerId : undefined, orders: loggedIn ? await prisma.paymentOrder.findMany({ where: { business, status: 'pending' }, select: { id: true, total: true, checkoutUrl: true, createdAt: true, expiresAt: true } }) : [] }, { headers: { 'Cache-Control': 'no-store' } });
    }
    config();
    if (request.method !== 'POST') throw new PaymentError('Método no permitido.', 405);
    sameOrigin(request);
    if (action === 'connect') {
      const form = await request.formData();
      if (!await authorized(business) && !equal(String(form.get('setupKey') || ''), config().setupKey)) throw new PaymentError('Clave de administración incorrecta.', 403);
      const state = secret(), verifier = secret();
      await prisma.mercadoPagoOAuth.deleteMany({ where: { expiresAt: { lt: new Date() } } });
      await prisma.mercadoPagoOAuth.create({ data: { id: hash(state), business, verifier: seal(verifier), expiresAt: new Date(Date.now() + 600000) } });
      (await cookies()).set('mp_oauth', state, { ...cookieOptions, maxAge: 600 });
      const target = new URL('https://auth.mercadopago.com/authorization');
      target.search = new URLSearchParams({ client_id: config().clientId, response_type: 'code', platform_id: 'mp', state, redirect_uri: `${config().origin}/api/mercadopago/callback`, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' }).toString();
      return Response.json({ url: target.toString() });
    }
    await requireSession(business);
    if (action === 'logout') {
      (await cookies()).delete(sessionName(business));
      return Response.json({ ok: true });
    }
    if (action === 'checkout') {
      const input = await request.json(), data = saleSchema.omit({ received: true, method: true, reference: true }).parse(input);
      const connection = await prisma.mercadoPagoConnection.findUniqueOrThrow({ where: { business } });
      let order = await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM "Business" WHERE id = ${business} FOR UPDATE`;
        const existing = await tx.paymentOrder.findUnique({ where: { id: data.id } });
        if (existing) { if (existing.business !== business || existing.sellerId !== connection.sellerId) throw new PaymentError('Identificador ocupado.'); return existing; }
        if (await tx.sale.findUnique({ where: { id: data.id } })) throw new PaymentError('Esta venta ya existe.');
        if (await tx.paymentOrder.count({ where: { business, status: 'pending' } })) throw new PaymentError('Revisa primero el cobro pendiente en Pagos.');
        const shift = await tx.shift.findFirst({ where: { business, closed: null } });
        if (!shift) throw new PaymentError('Abre la caja antes de cobrar.');
        const priced = await priceSale(tx, business, data.items, input.total);
        if (priced.total <= 0) throw new PaymentError('El importe debe ser mayor que cero.');
        return tx.paymentOrder.create({ data: { id: data.id, business, sellerId: connection.sellerId, shift: shift.id, items: priced.items, total: priced.total, mode: data.mode, note: data.note, expiresAt: new Date(Date.now() + 1800000) } });
      });
      if (order.status !== 'pending') throw new PaymentError('Este cobro ya terminó. Consulta Pagos.');
      if (!order.checkoutUrl) {
        // Serialize preference creation for retries; one remote checkout per immutable order.
        const token = await access(business);
        order = await prisma.$transaction(async tx => {
          await tx.$queryRaw`SELECT id FROM "PaymentOrder" WHERE id = ${order.id} FOR UPDATE`;
          const current = await tx.paymentOrder.findUniqueOrThrow({ where: { id: order.id } });
          if (current.status !== 'pending') throw new PaymentError('Este cobro ya terminó.');
          if (current.checkoutUrl) return current;
          const back = `${config().origin}/pagos?business=${business}&order=${order.id}`;
          const preference = await provider<{ id: string; init_point: string; sandbox_init_point: string }>('/checkout/preferences', token, { items: [{ id: order.id, title: 'Pedido CarritoControl', quantity: 1, currency_id: 'MXN', unit_price: order.total / 100 }], external_reference: order.id, back_urls: { success: back, failure: back, pending: back }, auto_return: 'approved', notification_url: `${config().origin}/api/mercadopago/webhook`, expires: true, expiration_date_to: order.expiresAt.toISOString(), payment_methods: { excluded_payment_types: [{ id: 'ticket' }, { id: 'atm' }] } });
          const checkoutUrl = process.env.MP_TEST_MODE === 'true' ? preference.sandbox_init_point : preference.init_point;
          if (!checkoutUrl || new URL(checkoutUrl).protocol !== 'https:') throw new PaymentError('Enlace de cobro inválido.', 502);
          return tx.paymentOrder.update({ where: { id: order.id }, data: { preferenceId: preference.id, checkoutUrl } });
        }, { timeout: 20000 });
      }
      return Response.json({ id: order.id, checkoutUrl: order.checkoutUrl });
    }
    if (action === 'discard') {
      const { id } = z.object({ id: z.string().min(1).max(100) }).parse(await request.json());
      await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM "PaymentOrder" WHERE id = ${id} FOR UPDATE`;
        const order = await tx.paymentOrder.findFirst({ where: { id, business } });
        if (!order || order.checkoutUrl || order.preferenceId || order.status !== 'pending') throw new PaymentError('Solo puedes descartar cobros sin enlace de pago.');
        await tx.paymentOrder.update({ where: { id }, data: { status: 'cancelled' } });
      });
      return Response.json({ ok: true });
    }
    if (action === 'verify') {
      const { id } = z.object({ id: z.string().min(1).max(100) }).parse(await request.json());
      const order = await prisma.paymentOrder.findFirst({ where: { id, business } });
      if (!order) throw new PaymentError('Cobro no encontrado.', 404);
      await reconcile(id);
      return Response.json({ order: await prisma.paymentOrder.findUnique({ where: { id }, select: { id: true, status: true } }), sale: await prisma.sale.findUnique({ where: { id } }) });
    }
    throw new PaymentError('Ruta no encontrada.', 404);
  } catch (error) {
    if (new URL(request.url).pathname.endsWith('/callback')) {
      try { return Response.redirect(`${config().origin}/pagos?mp=error`, 303); } catch { /* Configuration errors use the generic response. */ }
    }
    if (error instanceof PaymentError || error instanceof HttpError) return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof z.ZodError || error instanceof SyntaxError) return Response.json({ error: 'Revisa los datos del cobro.' }, { status: 400 });
    // Never log provider responses, codes, tokens, secrets or callback URLs.
    return Response.json({ error: 'No fue posible completar la operación. Revisa la configuración y vuelve a intentar.' }, { status: 503 });
  }
}
