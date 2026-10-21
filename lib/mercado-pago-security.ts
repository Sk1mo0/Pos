import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export function config() {
  const { MP_CLIENT_ID, MP_CLIENT_SECRET, MP_ENCRYPTION_KEY, MP_SETUP_KEY, MP_WEBHOOK_SECRET, APP_URL } = process.env;
  if (!MP_CLIENT_ID || !MP_CLIENT_SECRET || !MP_SETUP_KEY || MP_SETUP_KEY.length < 16 || !MP_WEBHOOK_SECRET || !MP_ENCRYPTION_KEY || !/^[a-f\d]{64}$/i.test(MP_ENCRYPTION_KEY) || !APP_URL) throw new Error('Configura Mercado Pago en el servidor: consulta README.md.');
  const url = new URL(APP_URL);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/') throw new Error('APP_URL debe ser un origen público HTTPS.');
  return { clientId: MP_CLIENT_ID, clientSecret: MP_CLIENT_SECRET, key: Buffer.from(MP_ENCRYPTION_KEY, 'hex'), setupKey: MP_SETUP_KEY, webhookSecret: MP_WEBHOOK_SECRET, origin: url.origin };
}
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const secret = () => randomBytes(32).toString('base64url');
export function equal(a: string, b: string) { return timingSafeEqual(Buffer.from(hash(a)), Buffer.from(hash(b))); }
export function seal(value: unknown) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', config().key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url');
}
export function unseal<T>(value: string): T {
  const bytes = Buffer.from(value, 'base64url');
  const decipher = createDecipheriv('aes-256-gcm', config().key, bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'));
}
export function validWebhook(request: Request) {
  const id = new URL(request.url).searchParams.get('data.id'), requestId = request.headers.get('x-request-id');
  const parts = Object.fromEntries((request.headers.get('x-signature') || '').split(',').map(v => v.trim().split('=')));
  if (!id || !requestId || !/^\d+$/.test(parts.ts || '') || !/^[a-f\d]{64}$/i.test(parts.v1 || '')) return false;
  const manifest = `id:${id.toLowerCase()};request-id:${requestId};ts:${parts.ts};`;
  return equal(createHmac('sha256', config().webhookSecret).update(manifest).digest('hex'), parts.v1);
}
export type ProviderPayment = { id: number; status: string; external_reference: string; collector_id: number; currency_id: string; transaction_amount: number; live_mode: boolean };
export function matchesPayment(payment: ProviderPayment, order: { id: string; sellerId: string; total: number }) {
  return payment.status === 'approved' && payment.external_reference === order.id && String(payment.collector_id) === order.sellerId && payment.currency_id === 'MXN' && Number.isFinite(payment.transaction_amount) && Math.round(payment.transaction_amount * 100) === order.total && payment.live_mode === (process.env.MP_TEST_MODE !== 'true');
}
