export type SaleUnit = 'unit' | 'weight';
export const quantityLimit = (unit?: string) => unit === 'weight' ? 999000 : 999;
export const priceUnit = (unit?: string) => unit === 'weight' ? 'kg' : 'unidad';
export const quantityLabel = (item: { qty: number; unit?: string }) =>
  item.unit === 'weight' ? `${item.qty.toLocaleString('es-MX')} g` : `${item.qty} ${item.qty === 1 ? 'unidad' : 'unidades'}`;

// Prices are cents per unit or kilogram; weight quantities are whole grams.
// Round each line once so displayed lines, checkout and stored totals agree.
export function itemTotal(item: { price: number; qty: number; unit?: string }) {
  return Math.round(item.price * item.qty / (item.unit === 'weight' ? 1000 : 1));
}
export const cartCount = (cart: { qty: number; unit?: string }[]) =>
  cart.reduce((sum, item) => sum + (item.unit === 'weight' ? 1 : item.qty), 0);
