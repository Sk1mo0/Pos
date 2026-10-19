import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { cartCount, itemTotal, quantityLabel } from '../lib/pricing';
import { cartTotal, type Item } from '../app/pos-data';

const item = (price: number, qty: number, unit: 'unit' | 'weight'): Item => ({ id: unit, name: 'Prueba', description: '', price, qty, unit, business: 'tienda', category: 'Pruebas', emoji: '📦', extras: [], note: '' });

describe('cobro por unidad y gramaje', () => {
  test('cobra unidades completas y conserva tickets anteriores sin modalidad', () => {
    assert.equal(itemTotal(item(1200, 3, 'unit')), 3600);
    assert.equal(itemTotal({ price: 1200, qty: 3 }), 3600);
  });
  test('prorratea gramos respecto al precio por kilogramo', () => {
    assert.equal(itemTotal(item(8000, 250, 'weight')), 2000);
    assert.equal(itemTotal(item(4200, 1500, 'weight')), 6300);
    assert.equal(itemTotal(item(4200, 1, 'weight')), 4);
  });
  test('redondea cada renglón a centavos antes de sumar un pedido mixto', () => {
    const cart = [item(1234, 333, 'weight'), item(1234, 333, 'weight'), item(2200, 2, 'unit')];
    assert.equal(itemTotal(cart[0]), 411);
    assert.equal(cartTotal(cart), 5222);
    assert.equal(Number.isInteger(cartTotal(cart)), true);
  });
  test('identifica gramos y cuenta una línea pesada como un producto', () => {
    assert.equal(quantityLabel(item(4200, 250, 'weight')), '250 g');
    assert.equal(cartCount([item(4200, 250, 'weight'), item(2200, 2, 'unit')]), 3);
  });
});
