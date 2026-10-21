import { z } from 'zod';
import { itemTotal, quantityLimit } from './pricing';
import { prisma } from './prisma';
import { Prisma } from '../generated/prisma/client';
const businessSchema = z.enum(['tacos', 'tienda']);
const cents = z.number().int().min(0).max(100000000);
const text = z.string().trim().max(500);
const method = z.enum(['Efectivo', 'Externo manual']);
const unit = z.enum(['unit', 'weight']);
const productSchema = z.object({ name: text.min(1), description: text, price: cents, unit: unit.default('unit'), category: text.min(1), emoji: z.string().trim().min(1).max(16) });
export const saleSchema = z.object({ id: z.string().min(1).max(100), items: z.array(z.object({ id: z.string(), qty: z.number().int().min(1).max(999000), unit: unit.default('unit'), extras: z.array(z.enum(['Queso', 'Aguacate'])).max(2).refine(v => new Set(v).size === v.length), note: text })).min(1).max(100), received: cents, method, reference: text, mode: z.enum(['Mostrador', 'Para llevar']), note: text });
export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
function fail(message: string): never { throw new HttpError(409, message); }
async function snapshot() {
  const [products, sales, shifts] = await Promise.all([prisma.product.findMany({ orderBy: { name: 'asc' } }), prisma.sale.findMany({ orderBy: { date: 'asc' } }), prisma.shift.findMany({ orderBy: { opened: 'asc' } })]);
  return { products, sales, shifts };
}
export async function handle(request: Request, context: { params: Promise<{ resource: string; id?: string[] }> }) {
  try {
    const { resource, id: segments } = await context.params;
    if (segments && segments.length !== 1) throw new HttpError(404, 'Ruta no encontrada.');
    const id = segments?.[0];
    if (!['state', 'products', 'sales', 'shifts'].includes(resource)) throw new HttpError(404, 'Recurso no encontrado.');
    if (request.method === 'GET') {
      if (resource === 'state' && !id) return Response.json(await snapshot());
      const business = businessSchema.parse(new URL(request.url).searchParams.get('business'));
      const where = { business, ...(id ? { id } : {}) };
      const rows = resource === 'products' ? await prisma.product.findMany({ where }) : resource === 'sales' ? await prisma.sale.findMany({ where, orderBy: { date: 'desc' } }) : await prisma.shift.findMany({ where, orderBy: { opened: 'desc' } });
      if (id && !rows.length) throw new HttpError(404, 'Registro no encontrado.');
      return Response.json(id ? rows[0] : rows);
    }
    if (resource === 'state') throw new HttpError(405, 'Método no permitido.');
    const input = await request.json();
    const business = businessSchema.parse(input.business);
    if (request.method === 'POST' ? !!id : !id) throw new HttpError(400, 'Identificador inválido.');
    const result = await prisma.$transaction(async tx => {
      // All changes for one business share a row lock: checkout cannot race shift closure.
      await tx.$queryRaw`SELECT id FROM "Business" WHERE id = ${business} FOR UPDATE`;
      if (resource === 'products') {
        if (request.method === 'POST') return tx.product.create({ data: { ...productSchema.parse(input), business } });
        const current = await tx.product.findFirst({ where: { id, business } });
        if (!current) throw new HttpError(404, 'Producto no encontrado.');
        if (request.method === 'DELETE') return tx.product.delete({ where: { id } });
        return tx.product.update({ where: { id }, data: productSchema.parse(input) });
      }
      const active = await tx.shift.findFirst({ where: { business, closed: null } });
      if (resource === 'sales') {
        if (request.method === 'POST') {
          const data = saleSchema.parse(input);
          const existing = await tx.sale.findUnique({ where: { id: data.id } });
          if (existing) { if (existing.business !== business) fail('Identificador de venta ocupado.'); return existing; }
          if (!active) fail('Abre la caja antes de cobrar.');
          if (await tx.paymentOrder.count({ where: { business, status: 'pending' } })) fail('Resuelve el cobro pendiente de Mercado Pago en Pagos antes de realizar otra venta.');
          const { items, total } = await priceSale(tx, business, data.items, input.total);
          const received = data.method === 'Efectivo' ? data.received : total;
          if (received < total) fail('El efectivo recibido es insuficiente.');
          const shop = await tx.business.update({ where: { id: business }, data: { sequence: { increment: 1 } } });
          return tx.sale.create({ data: { ...data, items, business, shift: active.id, total, received, change: received - total, number: String(shop.sequence).padStart(4, '0') } });
        }
        const sale = await tx.sale.findFirst({ where: { id, business } });
        if (!sale) throw new HttpError(404, 'Venta no encontrada.');
        if (sale.method === 'Mercado Pago' && (request.method === 'DELETE' || input.reference !== sale.reference)) fail('Los pagos de Mercado Pago conservan su referencia y no se pueden eliminar.');
        if (sale.shift !== active?.id) fail('Las ventas de turnos cerrados no se pueden modificar.');
        if (request.method === 'DELETE') return tx.sale.delete({ where: { id } });
        const data = z.object({ note: text, reference: text }).parse(input);
        return tx.sale.update({ where: { id }, data });
      }
      if (request.method === 'POST') {
        if (active) fail('Ya existe un turno abierto.');
        return tx.shift.create({ data: { business, fund: cents.parse(input.fund) } });
      }
      const shift = await tx.shift.findFirst({ where: { id, business } });
      if (!shift) throw new HttpError(404, 'Turno no encontrado.');
      if (shift.closed) fail('El turno ya está cerrado.');
      if ((request.method === 'DELETE' || input.action === 'close') && await tx.paymentOrder.count({ where: { business, shift: id, status: 'pending' } })) fail('Hay cobros de Mercado Pago pendientes. Revísalos en Pagos antes de cerrar o eliminar la caja.');
      const sales = await tx.sale.findMany({ where: { shift: id } });
      if (request.method === 'DELETE') {
        if (sales.length) fail('No se puede eliminar un turno con ventas.');
        return tx.shift.delete({ where: { id } });
      }
      if (input.action === 'close') {
        const counted = cents.parse(input.counted), reason = text.parse(input.reason);
        const expected = shift.fund + sales.filter(s => s.method === 'Efectivo').reduce((sum, sale) => sum + sale.total, 0);
        if (counted !== expected && !reason) fail('Indica el motivo de la diferencia.');
        return tx.shift.update({ where: { id }, data: { counted, reason, expected, difference: counted - expected, closed: new Date() } });
      }
      return tx.shift.update({ where: { id }, data: { fund: cents.parse(input.fund) } });
    }, { timeout: 15000 });
    return Response.json(result, { status: request.method === 'POST' ? 201 : 200 });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) return Response.json({ error: 'Revisa los campos y los importes del formulario.' }, { status: 400 });
    if (error instanceof HttpError) return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return Response.json({ error: 'Este registro ya existe.' }, { status: 409 });
    console.error('POS database operation failed:', error instanceof Error ? error.name : 'Unknown error');
    return Response.json({ error: 'No fue posible acceder a la base de datos. Intenta de nuevo.' }, { status: 503 });
  }
}

export async function priceSale(tx: Prisma.TransactionClient, business: string, inputItems: z.infer<typeof saleSchema>["items"], expectedTotal: unknown) {
  const items = await Promise.all(inputItems.map(async item => {
    const product = await tx.product.findFirst({ where: { id: item.id, business } });
    if (!product) fail('Un producto ya no está disponible. Actualiza el pedido.');
    if (item.unit !== product.unit) fail('La modalidad del producto cambió. Retíralo del pedido y agrégalo de nuevo.');
    if (item.qty > quantityLimit(product.unit)) fail('La cantidad excede el límite permitido.');
    if (item.extras.length && !['Tacos', 'Antojitos'].includes(product.category)) fail('Extras no disponibles para este producto.');
    return { ...product, qty: item.qty, extras: item.extras, note: item.note, price: product.price + item.extras.reduce((sum, extra) => sum + (extra === 'Queso' ? 1000 : 1500), 0) };
  }));
  const total = items.reduce((sum, item) => sum + itemTotal(item), 0);
  if (!Number.isSafeInteger(total) || total > 100000000) fail('El total excede el límite permitido.');
  if (total !== expectedTotal) fail('Los precios cambiaron. Actualiza el pedido antes de cobrar.');
  return { items, total };
}
