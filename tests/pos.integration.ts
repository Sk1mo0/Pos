import 'dotenv/config';
import assert from 'node:assert/strict';
import { handle } from '../lib/pos-api';
import { prisma } from '../lib/prisma';

// Run explicitly with `bun run test:integration` against the configured database.
// Creates only temporary records; cleanup targets their exact identifiers.
const business = 'tienda';
const createdProducts: string[] = [], createdSales: string[] = [], createdShifts: string[] = [];
async function api(resource: string, method = 'GET', data: object = {}, id?: string, shop = business) {
  const response = await handle(new Request(`http://localhost/api/${resource}${id ? `/${id}` : ''}?business=${shop}`, { method, ...(method === 'GET' ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ business: shop, ...data }) }) }), { params: Promise.resolve({ resource, id: id ? [id] : undefined }) });
  return { status: response.status, body: await response.json() };
}
try {
  const product = { name: `Prueba CRUD ${crypto.randomUUID()}`, description: 'Registro temporal de integración', category: 'Pruebas', price: 1200, emoji: '📦' };
  assert.equal((await api('products', 'POST', { ...product, price: -1 })).status, 400);
  const created = await api('products', 'POST', product); assert.equal(created.status, 201); createdProducts.push(created.body.id);
  assert.equal((await api('products', 'GET', {}, created.body.id)).body.price, 1200);
  assert.equal((await api('products', 'PATCH', { ...product, price: 1500 }, created.body.id)).body.price, 1500);
  assert.equal((await api('products', 'PATCH', product, created.body.id, 'tacos')).status, 404);
  assert.equal((await api('products', 'DELETE', {}, created.body.id)).status, 200);
  assert.equal((await api('products', 'GET', {}, created.body.id)).status, 404);
  assert.equal((await api('products', 'POST', { ...product, unit: 'invalid' })).status, 400);
  console.log('OK: productos CRUD, validación y aislamiento por negocio.');

  if (await prisma.shift.findFirst({ where: { business, closed: null } })) {
    console.log('Caja existente: se omiten pruebas de turnos y ventas para preservar el turno en uso.');
  } else {
    const opened = await api('shifts', 'POST', { fund: 10000 }); assert.equal(opened.status, 201); createdShifts.push(opened.body.id);
    assert.equal((await api('shifts', 'POST', { fund: 0 })).status, 409);
    assert.equal((await api('shifts', 'PATCH', { fund: 20000 }, opened.body.id)).body.fund, 20000);
    const p = await api('products', 'POST', product); createdProducts.push(p.body.id);
    const id = crypto.randomUUID(); createdSales.push(id);
    const sale = { id, items: [{ id: p.body.id, qty: 2, extras: [], note: '' }], total: 2400, received: 3000, method: 'Efectivo', reference: '', mode: 'Mostrador', note: '' };
    assert.equal((await api('sales', 'POST', { ...sale, total: 1 })).status, 409);
    const sold = await api('sales', 'POST', sale); assert.equal(sold.status, 201); assert.equal(sold.body.change, 600);
    assert.equal((await api('sales', 'POST', sale)).body.id, sold.body.id);
    assert.equal(await prisma.sale.count({ where: { id } }), 1);
    const weighed = await api('products', 'POST', { ...product, price: 1234, unit: 'weight' });
    assert.equal(weighed.status, 201); createdProducts.push(weighed.body.id);
    assert.equal((await api('products', 'GET', {}, weighed.body.id)).body.unit, 'weight');
    const weightId = crypto.randomUUID(); createdSales.push(weightId);
    const weightedSale = { ...sale, id: weightId, items: [{ id: weighed.body.id, qty: 333, unit: 'weight', extras: [], note: '' }], total: 411, received: 500 };
    for (const qty of [0, -1, 0.5, 999001]) {
      assert.equal((await api('sales', 'POST', { ...weightedSale, items: [{ ...weightedSale.items[0], qty }] })).status, 400);
    }
    assert.equal((await api('sales', 'POST', { ...weightedSale, items: [{ ...weightedSale.items[0], unit: 'unit' }] })).status, 409);
    assert.equal((await api('sales', 'POST', { ...weightedSale, total: 410 })).status, 409);
    assert.equal((await api('sales', 'POST', { ...weightedSale, items: [{ id: p.body.id, qty: 1000, extras: [], note: '' }] })).status, 409);
    const weightedSold = await api('sales', 'POST', weightedSale);
    assert.equal(weightedSold.status, 201); assert.equal(weightedSold.body.total, 411); assert.equal(weightedSold.body.change, 89);
    assert.equal(weightedSold.body.items[0].qty, 333); assert.equal(weightedSold.body.items[0].unit, 'weight');
    await api('products', 'PATCH', { ...product, unit: 'unit' }, weighed.body.id);
    assert.equal((await api('sales', 'GET', {}, weightId)).body.items[0].unit, 'weight');
    assert.equal((await api('sales', 'DELETE', {}, weightId)).status, 200);
    console.log('OK: gramaje, redondeo, cambio, validación de modalidad y conservación del ticket.');
    assert.equal((await api('shifts', 'DELETE', {}, opened.body.id)).status, 409);
    assert.equal((await api('sales', 'PATCH', { note: 'Actualizada', reference: 'TEST' }, id)).body.note, 'Actualizada');
    assert.equal((await api('sales', 'DELETE', {}, id, 'tacos')).status, 404);
    assert.equal((await api('sales', 'DELETE', {}, id)).status, 200);
    const secondId = crypto.randomUUID(); createdSales.push(secondId);
    assert.equal((await api('sales', 'POST', { ...sale, id: secondId })).status, 201);
    assert.equal((await api('shifts', 'PATCH', { action: 'close', counted: 0, reason: '' }, opened.body.id)).status, 409);
    const closed = await api('shifts', 'PATCH', { action: 'close', counted: 22400, reason: '' }, opened.body.id);
    assert.equal(closed.status, 200); assert.equal(closed.body.expected, 22400); assert.equal(closed.body.difference, 0);
    assert.equal((await api('sales', 'DELETE', {}, secondId)).status, 409);
    assert.equal((await api('sales', 'POST', { ...sale, id: crypto.randomUUID() })).status, 409);
    const empty = await api('shifts', 'POST', { fund: 0 }); createdShifts.push(empty.body.id);
    assert.equal((await api('shifts', 'DELETE', {}, empty.body.id)).status, 200);
    console.log('OK: ventas CRUD, idempotencia, cálculo del cambio, turnos CRUD y protección del cierre.');
  }
} finally {
  await prisma.sale.deleteMany({ where: { id: { in: createdSales } } });
  await prisma.shift.deleteMany({ where: { id: { in: createdShifts } } });
  await prisma.product.deleteMany({ where: { id: { in: createdProducts } } });
  await prisma.$disconnect();
}
