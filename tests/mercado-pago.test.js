import { test, expect, mock, beforeEach, afterAll } from 'bun:test';
import { createHmac } from 'node:crypto';
import { config, seal, unseal, hash, matchesPayment, validWebhook } from '../lib/mercado-pago-security';

const savedEnv = { ...process.env };
Object.assign(process.env, { APP_URL: 'https://pos.example.com', MP_CLIENT_ID: 'test-app', MP_CLIENT_SECRET: 'test-secret', MP_ENCRYPTION_KEY: 'ab'.repeat(32), MP_SETUP_KEY: 'test-administrator-key', MP_WEBHOOK_SECRET: 'test-signature-secret', MP_TEST_MODE: 'true' });
const jar = new Map();
const db = { connections: new Map(), attempts: new Map(), orders: new Map(), sales: new Map(), sequence: 0, closed: false };
const tx = {
  $queryRaw: async () => [],
  business: { update: async () => ({ sequence: ++db.sequence }) },
  shift: { findFirst: async () => db.closed ? null : ({ id: 'shift', closed: null }), findUnique: async () => ({ id: 'shift', closed: db.closed ? new Date() : null }) },
  product: { findFirst: async ({ where }) => where.id === 'product' ? { id: 'product', business: 'tacos', name: 'Prueba', price: 1200, unit: 'unit', category: 'Despensa', description: '', emoji: '📦' } : null },
  mercadoPagoConnection: {
    findUnique: async ({ where }) => db.connections.get(where.business) || null,
    findUniqueOrThrow: async ({ where }) => db.connections.get(where.business),
    findFirst: async ({ where }) => [...db.connections.values()].find(c => c.sellerId === where.sellerId),
    upsert: async ({ where, create, update }) => db.connections.set(where.business, db.connections.has(where.business) ? { ...db.connections.get(where.business), ...update } : create),
    update: async ({ where, data }) => db.connections.set(where.business, { ...db.connections.get(where.business), ...data }),
  },
  mercadoPagoOAuth: {
    create: async ({ data }) => db.attempts.set(data.id, data),
    findUnique: async ({ where }) => db.attempts.get(where.id),
    deleteMany: async ({ where }) => ({ count: where.id ? Number(db.attempts.delete(where.id)) : 0 }),
  },
  sale: {
    findUnique: async ({ where }) => db.sales.get(where.id) || null,
    findFirst: async ({ where }) => { const sale = db.sales.get(where.id); return sale?.business === where.business ? sale : null; },
    create: async ({ data }) => { if (db.sales.has(data.id)) throw new Error('duplicate sale'); db.sales.set(data.id, data); return data; },
  },
  paymentOrder: {
    findUnique: async ({ where }) => db.orders.get(where.id) || null,
    findUniqueOrThrow: async ({ where }) => { const order = db.orders.get(where.id); if (!order) throw new Error('not found'); return order; },
    findFirst: async ({ where }) => { const order = db.orders.get(where.id); return order?.business === where.business ? order : null; },
    findMany: async ({ where }) => [...db.orders.values()].filter(o => o.business === where.business && o.status === where.status),
    count: async ({ where }) => [...db.orders.values()].filter(o => o.business === where.business && o.status === where.status).length,
    create: async ({ data }) => { const order = { ...data, status: 'pending', preferenceId: null, checkoutUrl: null, createdAt: new Date() }; db.orders.set(data.id, order); return order; },
    update: async ({ where, data }) => { const order = { ...db.orders.get(where.id), ...data }; db.orders.set(where.id, order); return order; },
    updateMany: async ({ where, data }) => { const order = db.orders.get(where.id); if (order?.status === where.status) Object.assign(order, data); },
  },
};
mock.module('../lib/prisma', () => ({ prisma: { ...tx, $transaction: async callback => callback(tx) } }));
mock.module('next/headers', () => ({ cookies: async () => ({ get: name => jar.has(name) ? { value: jar.get(name) } : undefined, set: (name, value) => jar.set(name, value), delete: name => jar.delete(name) }) }));
const { mercadoPago } = await import('../lib/mercado-pago');
const originalFetch = globalThis.fetch;
let payments = [], providerCalls = [];
globalThis.fetch = async (url, options) => {
  const path = String(url).replace('https://api.mercadopago.com', '');
  providerCalls.push({ path, options });
  if (path === '/oauth/token') return Response.json({ access_token: 'fake-access', refresh_token: 'fake-refresh', expires_in: 3600, user_id: 42 });
  if (path === '/checkout/preferences') return Response.json({ id: 'pref', init_point: 'https://www.mercadopago.com.mx/checkout/live', sandbox_init_point: 'https://sandbox.mercadopago.com.mx/checkout/test' });
  if (path.startsWith('/v1/payments/search')) return Response.json({ results: payments });
  if (path.startsWith('/v1/payments/')) return Response.json(payments[0]);
  throw new Error(`Unexpected provider call: ${path}`);
};
async function call(action, body, business = 'tacos', headers = {}) {
  return mercadoPago(new Request(`https://pos.example.com/api/mercadopago/${action}?business=${business}`, { method: body ? 'POST' : 'GET', headers: { origin: 'https://pos.example.com', ...headers }, ...(body ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}) }), { params: Promise.resolve({ action }) });
}
function payment(overrides = {}) { return { id: 123, status: 'approved', external_reference: 'order', collector_id: 42, currency_id: 'MXN', transaction_amount: 24, live_mode: false, ...overrides }; }
function connectSession() {
  db.connections.set('tacos', { business: 'tacos', sellerId: '42', credentials: seal({ access_token: 'fake-access', refresh_token: 'fake-refresh' }), expiresAt: new Date(Date.now() + 3600000) });
  jar.set('mp_session_tacos', seal({ business: 'tacos', sellerId: '42', expires: Date.now() + 3600000 }));
}
const draft = { id: 'order', items: [{ id: 'product', qty: 2, unit: 'unit', extras: [], note: '' }], total: 2400, mode: 'Mostrador', note: '' };
beforeEach(() => { jar.clear(); for (const map of [db.connections, db.attempts, db.orders, db.sales]) map.clear(); db.closed = false; db.sequence = 0; payments = []; providerCalls = []; });
afterAll(() => { globalThis.fetch = originalFetch; process.env = savedEnv; });

test('tokens are encrypted and tampering is rejected', () => {
  const encrypted = seal({ access_token: 'private-token' });
  expect(encrypted).not.toContain('private-token');
  expect(unseal(encrypted)).toEqual({ access_token: 'private-token' });
  const bytes = Buffer.from(encrypted, 'base64url'); bytes[30] ^= 1;
  expect(() => unseal(bytes.toString('base64url'))).toThrow();
});
test('confirmation rejects wrong amount, currency, account, reference, status and environment', () => {
  const order = { id: 'order', sellerId: '42', total: 2400 };
  expect(matchesPayment(payment(), order)).toBe(true);
  for (const change of [{ transaction_amount: 23 }, { currency_id: 'USD' }, { collector_id: 43 }, { external_reference: 'different' }, { status: 'pending' }, { live_mode: true }]) expect(matchesPayment(payment(change), order)).toBe(false);
});
test('webhook signatures require the actual query ID and request ID', () => {
  const signature = createHmac('sha256', config().webhookSecret).update('id:123;request-id:req;ts:1700000000;').digest('hex');
  const headers = { 'x-request-id': 'req', 'x-signature': `ts=1700000000,v1=${signature}` };
  expect(validWebhook(new Request('https://pos.example.com/?data.id=123', { headers }))).toBe(true);
  expect(validWebhook(new Request('https://pos.example.com/?data.id=124', { headers }))).toBe(false);
  expect(validWebhook(new Request('https://pos.example.com/?data.id=123'))).toBe(false);
});
test('OAuth requires administrator key, sets PKCE, consumes state once and creates an owner session', async () => {
  const denied = new FormData(); denied.set('setupKey', 'wrong');
  expect((await call('connect', denied)).status).toBe(403);
  const form = new FormData(); form.set('setupKey', config().setupKey);
  const response = await call('connect', form), target = new URL((await response.json()).url);
  expect(target.origin).toBe('https://auth.mercadopago.com');
  expect(target.searchParams.get('code_challenge_method')).toBe('S256');
  const state = target.searchParams.get('state');
  expect(db.attempts.has(hash(state))).toBe(true);
  const callbackUrl = `https://pos.example.com/api/mercadopago/callback?code=fake&state=${state}`;
  const callback = await mercadoPago(new Request(callbackUrl), { params: Promise.resolve({ action: 'callback' }) });
  expect(callback.status).toBe(303); expect(callback.headers.get('location')).toContain('mp=connected');
  expect(db.connections.get('tacos').sellerId).toBe('42'); expect(jar.has('mp_session_tacos')).toBe(true);
  const replay = await mercadoPago(new Request(callbackUrl), { params: Promise.resolve({ action: 'callback' }) });
  expect(replay.headers.get('location')).toContain('mp=error');
  expect(providerCalls.filter(c => c.path === '/oauth/token')).toHaveLength(1);
});
test('checkout requires session, validates origin and server prices, then reuses the checkout on retry', async () => {
  expect((await call('checkout', draft)).status).toBe(401);
  connectSession();
  expect((await call('checkout', draft, 'tacos', { origin: 'https://attacker.example' })).status).toBe(403);
  expect((await call('checkout', { ...draft, total: 1 })).status).toBe(409);
  const response = await call('checkout', draft); expect(response.status).toBe(200);
  const first = await response.json(); expect(first.checkoutUrl).toContain('sandbox');
  expect((await (await call('checkout', draft)).json()).checkoutUrl).toBe(first.checkoutUrl);
  expect(providerCalls.filter(c => c.path === '/checkout/preferences')).toHaveLength(1);
  expect((await call('checkout', { ...draft, id: 'other-order' })).status).toBe(409);
});
test('pending and rejected attempts do not generate a sale; approved repeats generate exactly one', async () => {
  connectSession(); await call('checkout', draft);
  for (const status of ['pending', 'rejected']) { payments = [payment({ status })]; await call('verify', { id: 'order' }); expect(db.sales.size).toBe(0); expect(db.orders.get('order').status).toBe('pending'); }
  payments = [payment()];
  const first = await call('verify', { id: 'order' }); expect(first.status).toBe(200);
  const sale = (await first.json()).sale; expect(sale.total).toBe(2400); expect(sale.reference).toBe('123'); expect(sale.method).toBe('Mercado Pago');
  await call('verify', { id: 'order' }); expect(db.sales.size).toBe(1); expect(db.sequence).toBe(1);
});
test('wrong recipient or amount cannot generate a ticket', async () => {
  connectSession(); await call('checkout', draft);
  for (const change of [{ collector_id: 43 }, { transaction_amount: 1 }, { live_mode: true }]) { payments = [payment(change)]; await call('verify', { id: 'order' }); expect(db.sales.size).toBe(0); }
  expect((await call('verify', { id: 'order' }, 'tienda')).status).toBe(401);
});
test('expired checkouts release only when there is no processing payment', async () => {
  connectSession(); await call('checkout', draft); db.orders.get('order').expiresAt = new Date(Date.now() - 120000);
  payments = [payment({ status: 'in_process' })]; await call('verify', { id: 'order' }); expect(db.orders.get('order').status).toBe('pending');
  payments = [payment({ status: 'rejected' })]; await call('verify', { id: 'order' }); expect(db.orders.get('order').status).toBe('expired'); expect(db.sales.size).toBe(0);
});
test('signed webhook confirms approved payments without browser session', async () => {
  connectSession(); await call('checkout', draft); jar.clear(); payments = [payment()];
  const signature = createHmac('sha256', config().webhookSecret).update('id:123;request-id:req;ts:1700000000;').digest('hex');
  const request = new Request('https://pos.example.com/api/mercadopago/webhook?data.id=123', { method: 'POST', headers: { 'x-request-id': 'req', 'x-signature': `ts=1700000000,v1=${signature}` }, body: JSON.stringify({ type: 'payment', user_id: 42 }) });
  const response = await mercadoPago(request, { params: Promise.resolve({ action: 'webhook' }) });
  expect(response.status).toBe(200); expect(db.sales.size).toBe(1);
});

test('POS API rejects fabricated digital payments and protects pending shift closure', async () => {
  const { handle } = await import('../lib/pos-api');
  async function pos(resource, method, body, id) {
    return handle(new Request(`https://pos.example.com/api/${resource}`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, business: 'tacos' }) }), { params: Promise.resolve({ resource, id: id ? [id] : undefined }) });
  }
  expect((await pos('sales', 'POST', { ...draft, received: 2400, reference: '123', method: 'Mercado Pago' })).status).toBe(400);
  connectSession(); await call('checkout', draft);
  expect((await pos('shifts', 'PATCH', { action: 'close', counted: 0, reason: '' }, 'shift')).status).toBe(409);
  expect((await pos('shifts', 'DELETE', {}, 'shift')).status).toBe(409);
  expect((await pos('sales', 'POST', { ...draft, id: 'cash-order', received: 2400, reference: '', method: 'Efectivo' })).status).toBe(409);
  payments = [payment()]; await call('verify', { id: 'order' });
  expect((await pos('sales', 'DELETE', {}, 'order')).status).toBe(409);
  expect((await pos('sales', 'PATCH', { note: '', reference: 'fabricated' }, 'order')).status).toBe(409);
});
test('OAuth cannot replace an existing business owner with another seller', async () => {
  connectSession(); db.connections.get('tacos').sellerId = '99';
  jar.clear();
  const form = new FormData(); form.set('setupKey', config().setupKey);
  const target = new URL((await (await call('connect', form)).json()).url);
  const callback = await mercadoPago(new Request(`https://pos.example.com/api/mercadopago/callback?code=fake&state=${target.searchParams.get('state')}`), { params: Promise.resolve({ action: 'callback' }) });
  expect(callback.headers.get('location')).toContain('mp=error');
  expect(db.connections.get('tacos').sellerId).toBe('99');
  expect(jar.has('mp_session_tacos')).toBe(false);
});
